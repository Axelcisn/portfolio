// components/Strategy/CompanyCard.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTimeBasis } from "../ui/TimeBasisContext";
import { robustSpot } from "../../lib/spot"; // <-- NEW

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

/* ---------- robust price helpers (fallbacks still available if needed) ---------- */
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
      "spot","last","lastPrice","price",
      "regularMarketPrice","close","previousClose","prevClose",
    ];
    for (const k of keys) {
      const v = Number(o?.[k]);
      if (Number.isFinite(v) && v > 0) return v;
    }
    return NaN;
  };

  let v = tryKeys(obj);
  if (Number.isFinite(v)) return v;

  const nests = [
    obj.quote, obj.quotes, obj.price, obj.data, obj.meta,
    obj.result?.[0], obj.result, obj.chart?.result?.[0]?.meta,
  ];
  for (const nest of nests) {
    v = tryKeys(nest);
    if (Number.isFinite(v)) return v;
  }

  const arrs = [
    obj?.data?.c, obj?.c, obj?.close,
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
    j?.data?.c, j?.c, j?.close,
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

export default function CompanyCard({
  value = null,
  market = null,
  onConfirm,
  onHorizonChange,
  onIvSourceChange,
  onIvValueChange,
}) {
  /* -------- selection comes from the NAV search -------- */
  const [picked, setPicked] = useState(
    value?.symbol ? { symbol: value.symbol, name: value.name, exchange: value.exchange } : null
  );
  const selSymbol = useMemo(
    () => (picked?.symbol || "").trim().toUpperCase(),
    [picked]
  );

  /* -------- basic facts -------- */
  const [currency, setCurrency] = useState(value?.currency || "");
  const [spot, setSpot] = useState(value?.spot || null);
  const [exchangeLabel, setExchangeLabel] = useState("");
  const [lastTs, setLastTs] = useState(null);      // <-- NEW (timestamp)
  const [session, setSession] = useState("");      // <-- NEW (market session label)

  /* -------- horizon (days) -------- */
  const [days, setDays] = useState(30);

  /* -------- global time basis (365/252) -------- */
  const { basis } = useTimeBasis(); // persisted, app-wide

  /* -------- volatility UI state -------- */
  const [volSrc, setVolSrc] = useState("iv");        // 'iv' | 'hist' | 'manual'
  const [sigma, setSigma] = useState(null);          // annualized decimal
  const [volMeta, setVolMeta] = useState(null);
  const [volLoading, setVolLoading] = useState(false);

  /* -------- status -------- */
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  /* Abort/stale guards for volatility fetches */
  const volAbortRef = useRef(null);
  const volSeqRef = useRef(0);
  function cancelVol() {
    try { volAbortRef.current?.abort(); } catch {}
    volAbortRef.current = null;
    setVolLoading(false);
  }

  /* =========================
     API helpers (robust, with fallbacks)
     ========================= */

  // Replaces the previous /api/company direct read for spot/session,
  // using the shared robustSpot helper for consistency.
  async function fetchCompany(sym) {
    // spot + session + currency via robustSpot
    const sp = await robustSpot(sym, { nocache: false });
    setSpot(sp.spot);
    if (sp.currency) setCurrency(sp.currency);
    setSession(sp.session || "At close");
    setLastTs(sp.ts || Date.now());

    // Exchange label from picked (preferred) or leave blank
    setExchangeLabel(
      (picked?.exchange && (EX_NAMES[picked.exchange] || picked.exchange)) || ""
    );

    // Bubble up minimal info (keep extra fields nullable)
    onConfirm?.({
      symbol: sp.symbol || sym,
      name: picked?.name || value?.name || "",
      exchange: picked?.exchange || null,
      currency: sp.currency || "",
      spot: Number.isFinite(sp.spot) ? sp.spot : null,
      high52: value?.high52 ?? null,
      low52: value?.low52 ?? null,
      beta: value?.beta ?? null,
      basis, // keep header/parent aware of chosen basis
    });
  }

  /**
   * Obtain annualized sigma:
   *  1) /api/volatility (source=live|historical or volSource=…)
   *  2) fallback: /api/company/autoFields
   *  Cancel-safe & stale-guarded.
   */
  async function fetchSigma(sym, uiSource, d) {
    const mapped = uiSource === "hist" ? "historical" : "live";

    // cancel any in-flight call
    cancelVol();
    const ac = new AbortController();
    volAbortRef.current = ac;
    const mySeq = ++volSeqRef.current;
    setVolLoading(true);

    const tryVol = async (paramName) => {
      const u = `/api/volatility?symbol=${encodeURIComponent(sym)}&${paramName}=${encodeURIComponent(mapped)}&days=${encodeURIComponent(d)}`;
      const r = await fetch(u, { cache: "no-store", signal: ac.signal });
      const j = await r.json();
      if (!r.ok || j?.ok === false) throw new Error(j?.error || `Vol ${r.status}`);
      return j;
    };

    try {
      let j;
      try { j = await tryVol("source"); }
      catch { j = await tryVol("volSource"); }

      if (ac.signal.aborted || mySeq !== volSeqRef.current) return;

      setSigma(j?.sigmaAnnual ?? null);
      setVolMeta(j?.meta || null);
      onIvSourceChange?.(mapped === "live" ? "live" : "historical");
      onIvValueChange?.(j?.sigmaAnnual ?? null);
    } catch (e) {
      if (e?.name === "AbortError") return;
      try {
        // fallback: autoFields
        const url = `/api/company/autoFields?symbol=${encodeURIComponent(sym)}&days=${encodeURIComponent(d)}&volSource=${encodeURIComponent(mapped)}`;
        const r = await fetch(url, { cache: "no-store", signal: ac.signal });
        const j = await r.json();
        if (!r.ok || j?.ok === false) throw new Error(j?.error || `AutoFields ${r.status}`);
        if (ac.signal.aborted || mySeq !== volSeqRef.current) return;

        const s = j?.sigmaAnnual ?? j?.sigma ?? null;
        setSigma(s);
        setVolMeta(j?.meta || null);
        onIvSourceChange?.(mapped === "live" ? "live" : "historical");
        onIvValueChange?.(s);
      } catch (e2) {
        if (e2?.name === "AbortError") return;
        throw e2;
      }
    } finally {
      if (mySeq === volSeqRef.current) {
        setVolLoading(false);
        volAbortRef.current = null;
      }
    }
  }

  async function confirmSymbol(sym) {
    const s = (sym || "").toUpperCase();
    if (!s) return;
    setLoading(true); setMsg("");
    try {
      await fetchCompany(s);
      if (volSrc === "manual") {
        cancelVol();
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

  /* Subscribe to navbar search picks */
  useEffect(() => {
    const onPick = (e) => {
      const it = e?.detail || {};
      const sym = (it.symbol || "").toUpperCase();
      if (!sym) return;
      setPicked({ symbol: sym, name: it.name || "", exchange: it.exchange || it.exchDisp || "" });
      confirmSymbol(sym);
    };
    window.addEventListener("app:ticker-picked", onPick);
    return () => window.removeEventListener("app:ticker-picked", onPick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volSrc, days]);

  /* If a value was passed initially, confirm it once on mount */
  useEffect(() => {
    if (value?.symbol) {
      const sym = value.symbol.toUpperCase();
      setPicked({ symbol: sym, name: value.name || "", exchange: value.exchange || "" });
      confirmSymbol(sym);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Re-fetch sigma when source or days change (debounced ~350ms) */
  const daysTimer = useRef(null);
  useEffect(() => {
    if (!selSymbol || volSrc === "manual") {
      cancelVol();
      return;
    }
    clearTimeout(daysTimer.current);
    daysTimer.current = setTimeout(() => {
      fetchSigma(selSymbol, volSrc, days).catch((e) => setMsg(String(e?.message || e)));
    }, 350);
    return () => clearTimeout(daysTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, volSrc, selSymbol]);

  /* Lightweight live price poll via robustSpot (aligns with micro-cache TTL) */
  useEffect(() => {
    if (!selSymbol) return;
    let stop = false;
    let id;
    const tick = async () => {
      try {
        const sp = await robustSpot(selSymbol, { nocache: false });
        if (!stop) {
          if (Number.isFinite(sp.spot)) setSpot(sp.spot);
          setSession(sp.session || "At close");
          setLastTs(sp.ts || Date.now());
        }
      } catch { /* ignore */ }
      id = setTimeout(tick, 30000); // ~30s
    };
    tick();
    return () => { stop = true; clearTimeout(id); };
  }, [selSymbol]);

  return (
    <section className="company-block">
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
          <div className="small muted">
            {lastTs ? `Last updated ${new Date(lastTs).toLocaleTimeString([], { hour12: false })} · ${session || "At close"}` : ""}
          </div>
        </div>

        {/* ---- Time (basis only) ---- */}
        <div className="fg">
          <label>Time</label>
          <select
            className="field"
            aria-label="Time basis"
            value={basis}
            onChange={() => { /* basis UI moved to header; read-only here */ }}
            disabled
          >
            <option value={365}>365</option>
            <option value={252}>252</option>
          </select>
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
                value={Number.isFinite(sigma) ? `${(sigma * 100).toFixed(0)}%` : ""}
              />
            )}

            {/* subtle inline spinner (theme-aware) */}
            <span className={`vol-spin ${volLoading ? "is-on" : ""}`} aria-hidden="true" />
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

      {/* Local minimal styles (keeps Apple-style) */}
      <style jsx>{`
        .vol-wrap{ position: relative; }
        .vol-spin{
          position:absolute; right:10px; top:50%; margin-top:-8px;
          width:16px; height:16px; border-radius:50%;
          border:2px solid transparent;
          border-top-color: color-mix(in srgb, var(--text, #0f172a) 60%, var(--card, #fff));
          opacity:0; pointer-events:none;
          animation: vs-rot 0.9s linear infinite;
        }
        .vol-spin.is-on{ opacity:1; }
        @keyframes vs-rot{ to { transform: rotate(360deg); } }
      `}</style>
    </section>
  );
}
