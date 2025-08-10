// components/Strategy/CompanyCard.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import TickerSearch from "./TickerSearch";

/* Exchange pretty labels */
const EX_NAMES = {
  NMS: "NASDAQ", NGM: "NASDAQ GM", NCM: "NASDAQ CM",
  NYQ: "NYSE", ASE: "AMEX", PCX: "NYSE Arca",
  MIL: "Milan", LSE: "London", EBS: "Swiss", SWX: "Swiss",
  TOR: "Toronto", SAO: "São Paulo", BUE: "Buenos Aires",
};

const clamp = (x, a, b) => Math.min(Math.max(Number(x) || 0, a), b);
function fmtMoney(v, ccy = "") {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  const sign = ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : "$";
  return sign + n.toFixed(2);
}
function parsePctInput(str) {
  const v = Number(String(str).replace("%", "").trim());
  return Number.isFinite(v) ? v / 100 : NaN;
}

/* --- robust close/last extraction from various API shapes --- */
function pickLastClose(j) {
  const candidates = [
    j?.data?.c,
    j?.c,
    j?.close,
    j?.chart?.result?.[0]?.indicators?.quote?.[0]?.close,
    j?.result?.[0]?.indicators?.quote?.[0]?.close,
  ];
  for (const arr of candidates) {
    if (Array.isArray(arr) && arr.length) {
      const last = [...arr].filter((x) => Number.isFinite(x)).pop();
      if (Number.isFinite(last)) return last;
    }
  }
  const metaPx =
    j?.meta?.regularMarketPrice ??
    j?.chart?.result?.[0]?.meta?.regularMarketPrice ??
    j?.regularMarketPrice;
  return Number.isFinite(metaPx) ? metaPx : null;
}

export default function CompanyCard({
  value = null,
  market = null,
  onConfirm,
  onHorizonChange,
  onIvSourceChange,
  onIvValueChange,
}) {
  /* -------- search state -------- */
  const [typed, setTyped] = useState(value?.symbol || "");
  const [picked, setPicked] = useState(null); // {symbol, name, exchange}
  const selSymbol = useMemo(
    () => (picked?.symbol || typed || "").trim().toUpperCase(),
    [picked, typed]
  );

  /* -------- basic facts -------- */
  const [currency, setCurrency] = useState(value?.currency || "");
  const [spot, setSpot] = useState(value?.spot || null);
  const [exchangeLabel, setExchangeLabel] = useState("");

  /* -------- horizon (days) -------- */
  const [days, setDays] = useState(30);

  /* -------- volatility UI state -------- */
  // 'iv' = Implied Volatility, 'hist' = Historical, 'manual' = typed-in
  const [volSrc, setVolSrc] = useState("iv");
  // sigma is annualized *decimal* (e.g., 0.30 → 30%)
  const [sigma, setSigma] = useState(null);
  const [volMeta, setVolMeta] = useState(null);

  /* -------- status -------- */
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  /* =========================
     API helpers (robust, with fallbacks)
     ========================= */

  async function fetchSpotFromChart(sym) {
    try {
      const u = `/api/chart?symbol=${encodeURIComponent(sym)}&range=1d&interval=1m`;
      const r = await fetch(u, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || j?.ok === false) throw new Error(j?.error || `Chart ${r.status}`);
      const last = pickLastClose(j);
      return Number.isFinite(last) ? last : null;
    } catch {
      return null;
    }
  }

  async function fetchCompany(sym) {
    const r = await fetch(`/api/company?symbol=${encodeURIComponent(sym)}`, {
      cache: "no-store",
    });
    const j = await r.json();
    if (!r.ok || j?.ok === false) throw new Error(j?.error || `Company ${r.status}`);

    setCurrency(j.currency || "");
    let px = Number(j.spot);
    if (!Number.isFinite(px) || px <= 0) {
      // fallback to chart endpoint if quote failed/blocked
      px = await fetchSpotFromChart(sym);
    }
    setSpot(px ?? null);

    setExchangeLabel(
      picked?.exchange
        ? EX_NAMES[picked.exchange] || picked.exchange
        : j.exchange || j.exchangeName || ""
    );

    // Bubble up so the header can show a live price
    onConfirm?.({
      symbol: j.symbol || sym,
      name: j.name,
      exchange: picked?.exchange || j.exchange || null,
      currency: j.currency,
      spot: px ?? null,
      high52: j.high52 ?? null,
      low52: j.low52 ?? null,
      beta: j.beta ?? null,
    });
  }

  /**
   * Try to obtain annualized sigma from:
   *  1) /api/volatility using either ?source=live|historical or ?volSource=...
   *  2) fallback: /api/company/autoFields (it returns sigma too)
   */
  async function fetchSigma(sym, uiSource, d) {
    const mapped = uiSource === "hist" ? "historical" : "live";

    // attempt A: /api/volatility?source=live|historical
    const tryVol = async (paramName) => {
      const u = `/api/volatility?symbol=${encodeURIComponent(sym)}&${paramName}=${encodeURIComponent(
        mapped
      )}&days=${encodeURIComponent(d)}`;
      const r = await fetch(u, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || j?.ok === false) throw new Error(j?.error || `Vol ${r.status}`);
      return j;
    };

    try {
      let j;
      try {
        j = await tryVol("source");
      } catch {
        // some deployments used volSource instead of source
        j = await tryVol("volSource");
      }
      setSigma(j?.sigmaAnnual ?? null);
      setVolMeta(j?.meta || null);
      onIvSourceChange?.(mapped === "live" ? "live" : "historical");
      onIvValueChange?.(j?.sigmaAnnual ?? null);
      return;
    } catch (e1) {
      // attempt B: /api/company/autoFields
      try {
        const url = `/api/company/autoFields?symbol=${encodeURIComponent(
          sym
        )}&days=${encodeURIComponent(d)}&volSource=${encodeURIComponent(mapped)}`;
        const r = await fetch(url, { cache: "no-store" });
        const j = await r.json();
        if (!r.ok || j?.ok === false) throw new Error(j?.error || `AutoFields ${r.status}`);

        const s = j?.sigmaAnnual ?? j?.sigma ?? null;
        setSigma(s);
        setVolMeta(j?.meta || null);
        onIvSourceChange?.(mapped === "live" ? "live" : "historical");
        onIvValueChange?.(s);
        return;
      } catch (e2) {
        throw e2;
      }
    }
  }

  async function confirmSymbol(sym) {
    const s = (sym || selSymbol || "").toUpperCase();
    if (!s) return;
    setLoading(true); setMsg("");
    try {
      await fetchCompany(s);
      if (volSrc === "manual") {
        onIvSourceChange?.("manual");
        onIvValueChange?.(sigma);
      } else {
        await fetchSigma(s, volSrc, days);
      }
    } catch (e) {
      setMsg(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }
  function confirm(){ return confirmSymbol(selSymbol); }

  /* Re-fetch sigma when source or days change (debounced) */
  const daysTimer = useRef(null);
  useEffect(() => {
    if (!selSymbol || volSrc === "manual") return;
    clearTimeout(daysTimer.current);
    daysTimer.current = setTimeout(() => {
      fetchSigma(selSymbol, volSrc, days).catch((e) =>
        setMsg(String(e?.message || e))
      );
    }, 400);
    return () => clearTimeout(daysTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, volSrc, selSymbol]);

  /* Lightweight live price poll (15s). Uses chart endpoint only; safe for 401s. */
  useEffect(() => {
    if (!selSymbol) return;
    let stop = false;
    let id;
    const tick = async () => {
      const px = await fetchSpotFromChart(selSymbol);
      if (!stop && Number.isFinite(px)) {
        setSpot(px);
        // bubble updated price upward so the header shows it
        onConfirm?.({
          symbol: selSymbol,
          name: picked?.name || value?.name || "",
          exchange: picked?.exchange || null,
          currency,
          spot: px,
          high52: value?.high52 ?? null,
          low52: value?.low52 ?? null,
          beta: value?.beta ?? null,
        });
      }
      id = setTimeout(tick, 15000);
    };
    tick();
    return () => { stop = true; clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selSymbol]);

  return (
    <section className="company-block">
      <h2 className="company-title">Company</h2>

      {/* Search bar */}
      <div className="company-search">
        <TickerSearch
          value={typed}
          onPick={(it) => {
            setPicked(it);
            setTyped(it.symbol || "");
            setMsg("");
            if (it?.symbol) confirmSymbol(it.symbol);
          }}
          onEnter={() => confirm()}
          placeholder="Search by ticker or company (e.g., AAPL, ENEL.MI)…"
        />
        <button
          type="button"
          onClick={confirm}
          className="button company-confirm"
          disabled={!selSymbol || loading}
          aria-label="Confirm ticker"
        >
          {loading ? "Loading…" : "Confirm"}
        </button>
      </div>

      {/* Selected line */}
      {selSymbol && (
        <div className="company-selected small">
          <span className="muted">Selected:</span> <strong>{selSymbol}</strong>
          {picked?.name ? ` — ${picked.name}` : ""}
          {exchangeLabel ? ` • ${exchangeLabel}` : ""}
        </div>
      )}
      {msg && <div className="small" style={{ color: "#ef4444" }}>{msg}</div>}

      {/* Inline facts/controls */}
      <div className="company-fields">
        {/* Currency */}
        <div className="fg">
          <label>Currency</label>
          <input className="field" value={currency || ""} readOnly />
        </div>

        {/* Spot S */}
        <div className="fg">
          <label>S</label>
          <input className="field" value={fmtMoney(spot, currency)} readOnly />
        </div>

        {/* Time (days) */}
        <div className="fg">
          <label>Time</label>
          <input
            className="field"
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(e) => {
              const v = clamp(e.target.value, 1, 365);
              setDays(v);
              onHorizonChange?.(v);
            }}
          />
        </div>

        {/* Volatility */}
        <div className="fg">
          <label>Volatility</label>
          <div className="vol-wrap">
            <select
              className="field"
              value={volSrc}
              onChange={(e) => setVolSrc(e.target.value)}
            >
              <option value="iv">Implied Volatility</option>
              <option value="hist">Historical Volatility</option>
              <option value="manual">Manual</option>
            </select>
            {volSrc === "manual" ? (
              <input
                className="field"
                placeholder="0.30 = 30%"
                value={Number.isFinite(sigma) ? (sigma ?? 0) : ""}
                onChange={(e) => {
                  const v = parsePctInput(e.target.value);
                  setSigma(Number.isFinite(v) ? v : null);
                  onIvSourceChange?.("manual");
                  onIvValueChange?.(Number.isFinite(v) ? v : null);
                }}
              />
            ) : (
              <input
                className="field"
                readOnly
                value={
                  Number.isFinite(sigma)
                    ? `${(sigma * 100).toFixed(0)}%`
                    : ""
                }
              />
            )}
          </div>
          <div className="small muted">
            {volSrc === "iv" && volMeta?.expiry
              ? `IV @ ${volMeta.expiry}${volMeta?.fallback ? " · fallback used" : ""}`
              : volSrc === "hist" && volMeta?.pointsUsed
              ? `Hist ${days}d (n=${volMeta.pointsUsed})${volMeta?.fallback ? " · fallback used" : ""}`
              : ""}
          </div>
        </div>
      </div>
    </section>
  );
}
