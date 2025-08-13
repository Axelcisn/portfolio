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

const STORAGE_KEY = "companyCard.v1";

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

/* ---------- robust price helpers ---------- */
function lastFromArray(arr) {
  if (!Array.isArray(arr) || !arr.length) return NaN;
  for (let i = arr.length - 1; i >= 0; i--) {
    const n = Number(arr[i]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return NaN;
}

/** Try many common shapes to extract a spot/last/close price */
function pickSpot(obj) {
  if (!obj || typeof obj !== "object") return NaN;

  const tryKeys = (o) => {
    if (!o || typeof o !== "object") return NaN;
    const keys = [
      "spot",
      "last",
      "lastPrice",
      "price",
      "regularMarketPrice",
      "close",
      "previousClose",
      "prevClose",
    ];
    for (const k of keys) {
      const v = Number(o?.[k]);
      if (Number.isFinite(v) && v > 0) return v;
    }
    return NaN;
  };

  let v = tryKeys(obj);
  if (Number.isFinite(v)) return v;

  // common nests
  const nests = [
    obj.quote,
    obj.quotes,
    obj.price,
    obj.data,
    obj.meta,
    obj.result?.[0],
    obj.result,
    obj.chart?.result?.[0]?.meta,
  ];
  for (const nest of nests) {
    v = tryKeys(nest);
    if (Number.isFinite(v)) return v;
  }

  // array closes (chart-like)
  const arrs = [
    obj?.data?.c,
    obj?.c,
    obj?.close,
    obj?.chart?.result?.[0]?.indicators?.quote?.[0]?.close,
    obj?.result?.[0]?.indicators?.quote?.[0]?.close,
  ];
  for (const a of arrs) {
    v = lastFromArray(a);
    if (Number.isFinite(v)) return v;
  }

  return NaN;
}

/** Fallback close/last from chart payloads */
function pickLastClose(j) {
  const arrs = [
    j?.data?.c,
    j?.c,
    j?.close,
    j?.chart?.result?.[0]?.indicators?.quote?.[0]?.close,
    j?.result?.[0]?.indicators?.quote?.[0]?.close,
  ];
  for (const a of arrs) {
    const last = lastFromArray(a);
    if (Number.isFinite(last)) return last;
  }
  const metaPx =
    j?.meta?.regularMarketPrice ??
    j?.chart?.result?.[0]?.meta?.regularMarketPrice ??
    j?.regularMarketPrice;
  return Number.isFinite(metaPx) ? metaPx : null;
}

/* Safe storage helpers */
function readSaved() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw);
    if (!j || typeof j !== "object") return null;
    if (!j.symbol || typeof j.symbol !== "string") return null;
    const out = {
      symbol: j.symbol.toUpperCase(),
      name: typeof j.name === "string" ? j.name : "",
      exchange: typeof j.exchange === "string" ? j.exchange : "",
      currency: typeof j.currency === "string" ? j.currency : "",
      spot: Number.isFinite(j.spot) ? Number(j.spot) : null,
      days: Number.isFinite(j.days) ? Math.max(1, Math.min(365, Number(j.days))) : 30,
      volSrc: ["iv", "hist", "manual"].includes(j.volSrc) ? j.volSrc : "iv",
      sigma: typeof j.sigma === "number" ? j.sigma : null,
      ts: Number.isFinite(j.ts) ? Number(j.ts) : null,
    };
    return out;
  } catch {
    return null;
  }
}

function writeSaved(state) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, ts: Date.now() }));
  } catch {
    /* ignore storage errors */
  }
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
  const [volLoading, setVolLoading] = useState(false);

  /* -------- abort + sequence guards -------- */
  const companyCtrlRef = useRef(null);
  const volCtrlRef = useRef(null);
  const pollCtrlRef = useRef(null);
  const companySeqRef = useRef(0);
  const volSeqRef = useRef(0);

  const abortIfAny = (ref) => {
    try { ref.current?.abort(); } catch {}
    ref.current = null;
  };

  /* =========================
     API helpers (robust, with fallbacks)
     ========================= */

  async function fetchSpotFromChart(sym, signal) {
    try {
      const u = `/api/chart?symbol=${encodeURIComponent(sym)}&range=1d&interval=1m`;
      const r = await fetch(u, { cache: "no-store", signal });
      const j = await r.json();
      if (!r.ok || j?.ok === false) throw new Error(j?.error || `Chart ${r.status}`);
      const last = pickLastClose(j);
      return Number.isFinite(last) ? last : null;
    } catch (e) {
      if (e?.name === "AbortError") return null;
      return null;
    }
  }

  async function fetchCompany(sym, signal, seqToken) {
    const checkSeq = () => companySeqRef.current === seqToken;

    try {
      const r = await fetch(`/api/company?symbol=${encodeURIComponent(sym)}`, { cache: "no-store", signal });
      const j = await r.json();
      if (!r.ok || j?.ok === false) throw new Error(j?.error || `Company ${r.status}`);

      // currency from multiple places
      const ccy =
        j.currency || j.ccy || j?.quote?.currency || j?.price?.currency || j?.meta?.currency || "";
      if (ccy && checkSeq()) setCurrency(ccy);

      // try direct spot
      let px = pickSpot(j);

      // fallback A: /api/company/autoFields
      if (!Number.isFinite(px) || px <= 0) {
        try {
          const r2 = await fetch(
            `/api/company/autoFields?symbol=${encodeURIComponent(sym)}`,
            { cache: "no-store", signal }
          );
          const j2 = await r2.json();
          if (r2.ok && j2?.ok !== false) {
            const alt = pickSpot(j2);
            if (Number.isFinite(alt) && alt > 0) px = alt;
            const c2 = j2.currency || j2.ccy || j2?.quote?.currency;
            if (c2 && !ccy && checkSeq()) setCurrency(c2);
          }
        } catch (e) {
          if (e?.name !== "AbortError") { /* ignore other errors; fall back */ }
        }
      }

      // fallback B: chart endpoint
      if (!Number.isFinite(px) || px <= 0) {
        const c = await fetchSpotFromChart(sym, signal);
        if (Number.isFinite(c) && c > 0) px = c;
      }

      if (checkSeq()) setSpot(Number.isFinite(px) ? px : null);

      if (checkSeq()) {
        setExchangeLabel(
          picked?.exchange
            ? EX_NAMES[picked.exchange] || picked.exchange
            : j.exchange || j.exchangeName || ""
        );

        // Bubble up so the header can show a live price
        onConfirm?.({
          symbol: j.symbol || sym,
          name: j.name || j.longName || j.companyName || picked?.name || "",
          exchange: picked?.exchange || j.exchange || null,
          currency: ccy || j.currency || "",
          spot: Number.isFinite(px) ? px : null,
          high52: j.high52 ?? j.fiftyTwoWeekHigh ?? null,
          low52: j.low52 ?? j.fiftyTwoWeekLow ?? null,
          beta: j.beta ?? null,
        });
      }
    } catch (e) {
      if (e?.name === "AbortError") return;
      throw e;
    }
  }

  /**
   * Try to obtain annualized sigma from:
   *  1) /api/volatility using either ?source=live|historical or ?volSource=...
   *  2) fallback: /api/company/autoFields (it returns sigma too)
   */
  async function fetchSigma(sym, uiSource, d, signal, seqToken) {
    const checkSeq = () => volSeqRef.current === seqToken;
    const mapped = uiSource === "hist" ? "historical" : "live";

    // attempt A: /api/volatility?source=live|historical
    const tryVol = async (paramName) => {
      const u = `/api/volatility?symbol=${encodeURIComponent(sym)}&${paramName}=${encodeURIComponent(
        mapped
      )}&days=${encodeURIComponent(d)}`;
      const r = await fetch(u, { cache: "no-store", signal });
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
      if (!checkSeq()) return;
      setSigma(j?.sigmaAnnual ?? null);
      setVolMeta(j?.meta || null);
      onIvSourceChange?.(mapped === "live" ? "live" : "historical");
      onIvValueChange?.(j?.sigmaAnnual ?? null);
      return;
    } catch (e1) {
      if (e1?.name === "AbortError") return;
      // attempt B: /api/company/autoFields
      try {
        const url = `/api/company/autoFields?symbol=${encodeURIComponent(
          sym
        )}&days=${encodeURIComponent(d)}&volSource=${encodeURIComponent(mapped)}`;
        const r = await fetch(url, { cache: "no-store", signal });
        const j = await r.json();
        if (!r.ok || j?.ok === false) throw new Error(j?.error || `AutoFields ${r.status}`);
        if (!checkSeq()) return;
        const s = j?.sigmaAnnual ?? j?.sigma ?? null;
        setSigma(s);
        setVolMeta(j?.meta || null);
        onIvSourceChange?.(mapped === "live" ? "live" : "historical");
        onIvValueChange?.(s);
        return;
      } catch (e2) {
        if (e2?.name === "AbortError") return;
        throw e2;
      }
    }
  }

  async function confirmSymbol(sym) {
    const s = (sym || selSymbol || "").toUpperCase();
    if (!s) return;

    // Abort previous company fetch
    abortIfAny(companyCtrlRef);
    companyCtrlRef.current = new AbortController();
    const cSignal = companyCtrlRef.current.signal;
    const seq = ++companySeqRef.current;

    setLoading(true); setMsg("");
    try {
      await fetchCompany(s, cSignal, seq);

      if (volSrc === "manual") {
        onIvSourceChange?.("manual");
        onIvValueChange?.(sigma);
      } else {
        // Trigger a fresh sigma fetch with cancellation
        abortIfAny(volCtrlRef);
        volCtrlRef.current = new AbortController();
        const vSignal = volCtrlRef.current.signal;
        const vSeq = ++volSeqRef.current;
        setVolLoading(true);
        try {
          await fetchSigma(s, volSrc, days, vSignal, vSeq);
        } finally {
          if (vSeq === volSeqRef.current) setVolLoading(false);
        }
      }

      // Persist after a successful confirm flow
      saveSelection(s);
    } catch (e) {
      if (e?.name !== "AbortError") setMsg(String(e?.message || e));
    } finally {
      if (seq === companySeqRef.current) setLoading(false);
    }
  }
  function confirm(){ return confirmSymbol(selSymbol); }

  /* Re-fetch sigma when source or days change (debounced, cancel-safe) */
  const debounceRef = useRef(null);
  useEffect(() => {
    if (!selSymbol || volSrc === "manual") {
      // still persist edits (days) even if not fetching
      saveSelection(selSymbol);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      abortIfAny(volCtrlRef);
      volCtrlRef.current = new AbortController();
      const vSignal = volCtrlRef.current.signal;
      const vSeq = ++volSeqRef.current;
      setVolLoading(true);
      fetchSigma(selSymbol, volSrc, days, vSignal, vSeq)
        .catch((e) => { if (e?.name !== "AbortError") setMsg(String(e?.message || e)); })
        .finally(() => { if (vSeq === volSeqRef.current) setVolLoading(false); saveSelection(selSymbol); });
    }, 350);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, volSrc, selSymbol]);

  /* Manual sigma changes → persist quickly */
  const saveManualRef = useRef(null);
  useEffect(() => {
    if (volSrc !== "manual" || !selSymbol) return;
    clearTimeout(saveManualRef.current);
    saveManualRef.current = setTimeout(() => saveSelection(selSymbol), 250);
    return () => clearTimeout(saveManualRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sigma, selSymbol, volSrc]);

  /* Lightweight live price poll (15s). Uses chart endpoint only; safe for 401s. */
  useEffect(() => {
    if (!selSymbol) return;

    let stopped = false;
    let id;

    const tick = async () => {
      if (stopped) return;
      abortIfAny(pollCtrlRef);
      pollCtrlRef.current = new AbortController();
      const signal = pollCtrlRef.current.signal;

      const px = await fetchSpotFromChart(selSymbol, signal);
      if (!stopped && Number.isFinite(px)) {
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
        // Persist fresh spot
        saveSelection(selSymbol, px);
      }
      id = setTimeout(tick, 15000);
    };

    tick();
    return () => { stopped = true; clearTimeout(id); abortIfAny(pollCtrlRef); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selSymbol]);

  /* ---------- Load from storage on mount, then background refresh ---------- */
  useEffect(() => {
    const saved = readSaved();
    if (!saved) return;
    // Prime UI immediately
    setTyped(saved.symbol);
    setPicked({ symbol: saved.symbol, name: saved.name || "", exchange: saved.exchange || "" });
    setCurrency(saved.currency || "");
    if (Number.isFinite(saved.spot)) setSpot(saved.spot);
    setDays(saved.days ?? 30);
    setVolSrc(saved.volSrc || "iv");
    if (typeof saved.sigma === "number") setSigma(saved.sigma);

    // Notify parent with cached info
    onConfirm?.({
      symbol: saved.symbol,
      name: saved.name || "",
      exchange: saved.exchange || null,
      currency: saved.currency || "",
      spot: Number.isFinite(saved.spot) ? saved.spot : null,
      high52: value?.high52 ?? null,
      low52: value?.low52 ?? null,
      beta: value?.beta ?? null,
    });

    // Gentle refresh right after paint
    setTimeout(() => confirmSymbol(saved.symbol), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- Persist helper ---------- */
  function buildPersistPayload(symbol, overrideSpot = null) {
    if (!symbol) return null;
    return {
      symbol,
      name: picked?.name || "",
      exchange: picked?.exchange || "",
      currency: currency || "",
      spot: Number.isFinite(overrideSpot) ? overrideSpot : (Number.isFinite(spot) ? spot : null),
      days,
      volSrc,
      sigma: typeof sigma === "number" ? sigma : null,
    };
  }
  function saveSelection(symbol, overrideSpot = null) {
    try {
      const p = buildPersistPayload(symbol, overrideSpot);
      if (!p) return;
      writeSaved(p);
    } catch { /* ignore */ }
  }

  /* ---------- Clear helper ---------- */
  function clearSaved() {
    try { if (typeof window !== "undefined") localStorage.removeItem(STORAGE_KEY); } catch {}
    // abort any in-flight work
    abortIfAny(companyCtrlRef); abortIfAny(volCtrlRef); abortIfAny(pollCtrlRef);
    // reset UI (keep layout intact)
    setTyped("");
    setPicked(null);
    setCurrency("");
    setSpot(null);
    setExchangeLabel("");
    setDays(30);
    setVolSrc("iv");
    setSigma(null);
    setVolMeta(null);
    setMsg("");
    onConfirm?.(null);
  }

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
          <span className="muted">Selected:</span>{" "}
          <strong>{selSymbol}</strong>
          {picked?.name ? ` — ${picked.name}` : ""}
          {exchangeLabel ? ` • ${exchangeLabel}` : ""}{" "}
          <button
            type="button"
            className="link-muted"
            onClick={clearSaved}
            title="Clear saved selection"
          >
            Clear
          </button>
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
          <div className="vol-wrap" aria-busy={volLoading ? "true" : "false"}>
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

            {/* tiny spinner overlay while sigma loads; non-intrusive */}
            {volLoading && <span className="vol-spin" aria-hidden="true" />}
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

      {/* Minimal, scoped styles only for the tiny spinner + clear link */}
      <style jsx>{`
        .vol-wrap{ position:relative; display:flex; gap:10px; }
        .vol-spin{
          position:absolute; right:12px; top:50%; transform:translateY(-50%);
          width:14px; height:14px; border-radius:999px;
          border:2px solid color-mix(in srgb, var(--text, #0f172a) 25%, transparent);
          border-top-color: var(--text, #0f172a);
          opacity:.55; animation: vol-rot .9s linear infinite;
          pointer-events:none;
        }
        @keyframes vol-rot{ to { transform: translateY(-50%) rotate(360deg); } }

        .link-muted{
          margin-left:8px;
          background:none; border:0; padding:0;
          font-weight:700; font-size:12.5px;
          color: color-mix(in srgb, var(--text, #0f172a) 55%, transparent);
          cursor:pointer;
        }
        .link-muted:hover{
          color: var(--text, #0f172a);
          text-decoration: underline;
          text-underline-offset: 2px;
        }
      `}</style>
    </section>
  );
}
