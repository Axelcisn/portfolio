// components/Strategy/StatsRail.jsx
"use client";

/**
 * Key Stats + Expiry control (CONTROLLED).
 * - `selectedExpiry` is controlled by the parent (page).
 * - We NEVER overwrite parent selection on mount or list refresh.
 * - We only call `onExpiryChange(iso)` when the USER changes it.
 * - `onDaysChange(days)` fires whenever selected expiry → days changes.
 * - Expiry list MUST be the same list the Options tab uses.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTimeBasis } from "../ui/TimeBasisContext";
import { publishStatsCtx } from "./statsBus";

/* ===== helpers ===== */
const moneySign = (ccy) =>
  ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : ccy === "JPY" ? "¥" : "$";
const isNum = (x) => Number.isFinite(Number(x));
/** ✅ Only accept strictly positive, finite prices */
const isPos = (x) => {
  const n = Number(x);
  return Number.isFinite(n) && n > 0;
};
const parsePctInput = (str) => {
  const v = Number(String(str).replace("%", "").trim());
  return Number.isFinite(v) ? v / 100 : NaN;
};

function normalizeExpiries(expiries) {
  if (!Array.isArray(expiries)) return [];
  const iso = expiries
    .map((v) => {
      if (v instanceof Date) {
        const y = v.getFullYear();
        const m = String(v.getMonth() + 1).padStart(2, "0");
        const d = String(v.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
      }
      const s = String(v || "").slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
    })
    .filter(Boolean);
  return Array.from(new Set(iso)).sort();
}

/** Compute Days-To-Expiry (calendar days) to end-of-day in Europe/Rome. */
function daysToExpiry(expiryISO, tz = "Europe/Rome") {
  if (!expiryISO) return null;
  try {
    const endLocalString = new Date(`${expiryISO}T23:59:59`).toLocaleString("en-US", { timeZone: tz });
    const end = new Date(endLocalString);
    const now = new Date();
    const d = Math.ceil((end.getTime() - now.getTime()) / 86400000);
    return Math.max(1, d);
  } catch {
    return null;
  }
}

/* ===== tiny fetchers (unchanged behavior) ===== */
async function fetchSpotFromChart(sym) {
  try {
    const u = `/api/chart?symbol=${encodeURIComponent(sym)}&range=1d&interval=1m`;
    const r = await fetch(u, { cache: "no-store" });
    const j = await r.json();
    const arrs = [
      j?.data?.c, j?.c, j?.close,
      j?.chart?.result?.[0]?.indicators?.quote?.[0]?.close,
      j?.result?.[0]?.indicators?.quote?.[0]?.close,
    ].filter(Boolean);
    for (const a of arrs) {
      if (Array.isArray(a) && a.length) {
        const n = Number(a[a.length - 1]);
        if (Number.isFinite(n) && n > 0) return n;
      }
    }
    const metaPx =
      j?.meta?.regularMarketPrice ??
      j?.chart?.result?.[0]?.meta?.regularMarketPrice ??
      j?.regularMarketPrice;
    return Number.isFinite(metaPx) && metaPx > 0 ? metaPx : null;
  } catch {
    return null;
  }
}
async function fetchCompany(sym) {
  const r = await fetch(`/api/company?symbol=${encodeURIComponent(sym)}`, { cache: "no-store" });
  const j = await r.json();
  let spot = Number(j?.regularMarketPrice);
  if (!Number.isFinite(spot) || spot <= 0) spot = await fetchSpotFromChart(j.symbol || sym);
  const currency =
    j.currency || j.ccy || j?.quote?.currency || j?.price?.currency || j?.meta?.currency || "";
  return {
    symbol: j.symbol || sym,
    currency,
    beta: typeof j.beta === "number" ? j.beta : null,
    spot: Number.isFinite(spot) && spot > 0 ? spot : null,
  };
}
async function fetchMarketBasics({ index = "^GSPC", currency = "USD", lookback = "2y" }) {
  try {
    const u = `/api/market/stats?index=${encodeURIComponent(index)}&currency=${encodeURIComponent(currency)}&lookback=${encodeURIComponent(lookback)}&basis=annual`;
    const r = await fetch(u, { cache: "no-store" });
    const j = await r.json();
    return {
      rAnnual: typeof j?.riskFree?.r === "number" ? j.riskFree.r : null,
      erp: typeof j?.mrp === "number" ? j.mrp : null,
      indexAnn: typeof j?.indexAnn === "number" ? j.indexAnn : null,
    };
  } catch {
    return { rAnnual: null, erp: null, indexAnn: null };
  }
}
async function fetchBetaStats(sym, benchmark = "^GSPC") {
  try {
    const u = `/api/beta/stats?symbol=${encodeURIComponent(sym)}&benchmark=${encodeURIComponent(benchmark)}&range=5y&interval=1mo`;
    const r = await fetch(u, { cache: "no-store" });
    const j = await r.json();
    const b = typeof j?.beta === "number" ? j.beta : null;
    if (b == null) throw new Error("no_beta");
    return b;
  } catch {
    try {
      const rc = await fetch(`/api/company?symbol=${encodeURIComponent(sym)}`, { cache: "no-store" });
      const jc = await rc.json();
      return typeof jc?.beta === "number" ? jc.beta : null;
    } catch {
      return null;
    }
  }
}
async function fetchVol(sym, mapped, d, cm, signal) {
  const tryOne = async (param) => {
    const u = `/api/volatility?symbol=${encodeURIComponent(sym)}&${param}=${encodeURIComponent(mapped)}&days=${encodeURIComponent(d)}&cmDays=${encodeURIComponent(cm)}`;
    const r = await fetch(u, { cache: "no-store", signal });
    const j = await r.json();
    if (!r.ok || j?.ok === false) throw new Error(j?.error || `Vol ${r.status}`);
    return j;
  };
  try {
    return await tryOne("source");
  } catch {
    return await tryOne("volSource");
  }
}

/* ===== CAPM ===== */
const capmMu = (rf, beta, erp, q = 0) =>
  (Number(rf) || 0) + (Number(beta) || 0) * (Number(erp) || 0) - (Number(q) || 0);

/* ===== component ===== */
export default function StatsRail({
  /* expiry control (CONTROLLED) */
  expiries = [],
  selectedExpiry = null,
  onExpiryChange,
  onDaysChange,

  /* optional strategy plumbing */
  rows = null, onRowsChange,
  legs = null, onLegsChange,

  /* pricing context */
  spot: propSpot,
  currency: propCcy,
  company,
  market,
  children,
}) {
  const { basis, setBasis } = useTimeBasis();

  /* selection list */
  const expiryList = useMemo(() => normalizeExpiries(expiries), [expiries]);

  // internal only when uncontrolled
  const [internalIso, setInternalIso] = useState(null);
  const isControlled = !!selectedExpiry;
  const iso = isControlled ? selectedExpiry : internalIso;

  // when list first appears and we are UNCONTROLLED, pick nearest only once
  useEffect(() => {
    if (isControlled) return;
    if (!expiryList.length) { setInternalIso(null); return; }
    if (!internalIso || !expiryList.includes(internalIso)) {
      const todayISO = new Date().toISOString().slice(0, 10);
      const nearest = expiryList.find((e) => e >= todayISO) || expiryList[expiryList.length - 1];
      setInternalIso(nearest);
    }
  }, [expiryList, internalIso, isControlled]);

  const days = useMemo(() => daysToExpiry(iso, "Europe/Rome"), [iso]);

  // propagate days only (never touch parent's ISO here)
  useEffect(() => { if (days != null) onDaysChange?.(days); }, [days, onDaysChange]);

  /* market/vol stuff */
  const [symbol, setSymbol] = useState(company?.symbol || "");
  const [currency, setCurrency] = useState(propCcy || company?.currency || "");
  const [spot, setSpot] = useState(propSpot ?? null);
  const [rf, setRf] = useState(typeof market?.riskFree === "number" ? market.riskFree : null);
  const [erp, setErp] = useState(typeof market?.mrp === "number" ? market.mrp : null);
  const [beta, setBeta] = useState(Number.isFinite(company?.beta) ? company.beta : null);
  const [divPct, setDivPct] = useState("0.00");
  const qDec = useMemo(() => {
    const n = parsePctInput(divPct);
    return Number.isFinite(n) ? n : 0;
  }, [divPct]);

  // ⬇ default volatility source
  const [volSrc, setVolSrc] = useState("hist"); // "iv" | "hist"
  const [sigma, setSigma] = useState(null);
  const [volMeta, setVolMeta] = useState(null);
  const [volLoading, setVolLoading] = useState(false);
  const volAbortRef = useRef(null);
  const volSeqRef = useRef(0);
  const cancelVol = () => { try { volAbortRef.current?.abort(); } catch {} volAbortRef.current = null; setVolLoading(false); };
  const CM_DAYS = 30;

  const muCapm = useMemo(() => capmMu(rf, beta, erp, qDec), [rf, beta, erp, qDec]);

  // Drift mode (CAPM vs Risk-Free), persisted
  const [driftMode, setDriftMode] = useState(() => {
    try { return localStorage.getItem("stats.driftMode") || "CAPM"; } catch { return "CAPM"; }
  });
  useEffect(() => { try { localStorage.setItem("stats.driftMode", driftMode); } catch {} }, [driftMode]);

  /* ---------- NEW: sync local state with incoming props ---------- */
  // keep symbol in sync with parent-provided company
  useEffect(() => {
    if (company?.symbol && company.symbol !== symbol) setSymbol(company.symbol);
  }, [company?.symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  // keep currency in sync when parent/company changes
  useEffect(() => {
    const next = propCcy || company?.currency;
    if (next) setCurrency(next);
  }, [propCcy, company?.currency]);

  // keep spot synced from props when it becomes valid (>0)
  useEffect(() => {
    if (isPos(propSpot)) setSpot(propSpot);
  }, [propSpot]);

  /* ---------- events & fetchers ---------- */
  useEffect(() => {
    const onPick = (e) => {
      const it = e?.detail || {};
      const sym = (it.symbol || "").toUpperCase();
      if (!sym) return;
      setSymbol(sym);
    };
    window.addEventListener("app:ticker-picked", onPick);
    return () => window.removeEventListener("app:ticker-picked", onPick);
  }, []);

  useEffect(() => {
    if (!symbol) return;
    let mounted = true;
    (async () => {
      try {
        const c = await fetchCompany(symbol);
        if (!mounted) return;
        if (c.currency) setCurrency(c.currency);
        if (isPos(c.spot)) setSpot(c.spot); // ✅ only accept > 0

        const mb = await fetchMarketBasics({ index: "^GSPC", currency: c.currency || "USD", lookback: "2y" });
        if (!mounted) return;
        if (mb.rAnnual != null) setRf(mb.rAnnual);
        if (mb.erp != null) setErp(mb.erp);

        const b = await fetchBetaStats(symbol, "^GSPC");
        if (!mounted) return;
        if (b != null) setBeta(b);

        if (volSrc !== "manual") {
          cancelVol();
          const ac = new AbortController();
          volAbortRef.current = ac;
          const mySeq = ++volSeqRef.current;
          setVolLoading(true);
          try {
            const mapped = volSrc === "hist" ? "historical" : "live";
            const j = await fetchVol(symbol, mapped, 30, CM_DAYS, ac.signal);
            if (ac.signal.aborted || mySeq !== volSeqRef.current) return;
            setSigma(j?.sigmaAnnual ?? null);
            setVolMeta(j?.meta || null);
          } finally {
            if (mySeq === volSeqRef.current) { setVolLoading(false); volAbortRef.current = null; }
          }
        }
      } catch {}
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  useEffect(() => {
    if (typeof market?.riskFree === "number") setRf(market.riskFree);
    if (typeof market?.mrp === "number") setErp(market.mrp);
  }, [market?.riskFree, market?.mrp]);

  useEffect(() => {
    if (!symbol || volSrc === "manual") { cancelVol(); return; }
    (async () => {
      cancelVol();
      const ac = new AbortController();
      volAbortRef.current = ac;
      const mySeq = ++volSeqRef.current;
      setVolLoading(true);
      try {
        const mapped = volSrc === "hist" ? "historical" : "live";
        const j = await fetchVol(symbol, mapped, 30, CM_DAYS, ac.signal);
        if (ac.signal.aborted || mySeq !== volSeqRef.current) return;
        setSigma(j?.sigmaAnnual ?? null);
        setVolMeta(j?.meta || null);
      } catch {} finally {
        if (mySeq === volSeqRef.current) { setVolLoading(false); volAbortRef.current = null; }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volSrc, symbol]);

  useEffect(() => {
    if (!symbol) return;
    let stop = false, id;
    const tick = async () => {
      const px = await fetchSpotFromChart(symbol);
      if (!stop && isPos(px)) setSpot(px); // ✅ guard against 0/negatives
      id = setTimeout(tick, 15000);
    };
    tick();
    return () => { stop = true; clearTimeout(id); };
  }, [symbol]);

  // optional stamping
  const stampDaysOnRows = useCallback((rows, days) => {
    if (!Array.isArray(rows)) return rows;
    return rows.map((r) => {
      const t = String(r?.type || "").toLowerCase();
      const isOption = /^(lc|lp|sc|sp)$/.test(t);
      return isOption ? { ...r, days } : r;
    });
  }, []);
  const stampDaysOnLegs = useCallback((legs, days) => {
    if (!legs || typeof legs !== "object") return legs;
    const out = { ...legs };
    ["lc", "lp", "sc", "sp"].forEach((k) => { if (out[k]) out[k] = { ...out[k], days }; });
    return out;
  }, []);
  useEffect(() => {
    if (!(days > 0)) return;
    if (Array.isArray(rows) && typeof onRowsChange === "function") {
      onRowsChange(stampDaysOnRows(rows, days));
    }
    if (legs && typeof onLegsChange === "function") {
      onLegsChange(stampDaysOnLegs(legs, days));
    }
  }, [days, rows, legs, onRowsChange, onLegsChange, stampDaysOnRows, stampDaysOnLegs]);

  const showVolSkeleton = volSrc !== "manual" && symbol && (volLoading || !Number.isFinite(sigma));

  // Remove the “Imp (30d)” / “Hist (Xd)” label; only show a fallback note if present.
  const volDiag = volMeta?.fallback ? "fallback" : "";

  const fmtLong = (iso) => {
    const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return String(iso || "");
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return d.toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
  };

  const handlePick = (nextIso) => {
    if (!nextIso) return;
    if (isControlled) onExpiryChange?.(nextIso);
    else setInternalIso(nextIso);
  };

  // ---- BROADCAST CONTEXT to consumers (ChainTable)
  useEffect(() => {
    publishStatsCtx({
      basis,
      days,
      sigma,                  // annualized (decimal)
      rf,                     // annual rate
      erp,
      beta,
      muCapm,                 // rf + beta*erp - q
      q: qDec,                // dividend yield (decimal)
      spot: isPos(spot) ? spot : null,   // ✅ never broadcast 0/negatives
      currency,
      driftMode,              // "CAPM" | "RF"
    });
  }, [basis, days, sigma, rf, erp, beta, muCapm, qDec, spot, currency, driftMode]);

  return (
    <aside className="card">
      <h3>Key stats</h3>

      {/* Expiration (T) — controlled */}
      <div className="row">
        <div className="k">Expiration (T)</div>
        <div className="v v-expiry">
          <select
            className="select"
            value={iso || ""}
            onChange={(e) => handlePick(e.target.value || null)}
            title="Pick expiry"
          >
            {!expiryList.length ? (
              <option value="">No expiries</option>
            ) : (
              expiryList.map((d) => <option key={d} value={d}>{fmtLong(d)}</option>)
            )}
          </select>
          <span className="dte-pill" title="Days to expiry (Europe/Rome end-of-day)">
            {days != null ? `${days}d` : "—"}
          </span>
        </div>
      </div>

      {/* Current Price */}
      <div className="row">
        <div className="k">Current Price</div>
        <div className="v value">
          {isPos(spot) ? `${moneySign(currency)}${Number(spot).toFixed(2)}` : "—"}
        </div>
      </div>

      {/* Currency */}
      <div className="row">
        <div className="k">Currency</div>
        <div className="v value">{currency || "—"}</div>
      </div>

      {/* Time basis */}
      <div className="row">
        <div className="k">Time</div>
        <div className="v">
          <select className="select" value={basis} onChange={(e) => setBasis(Number(e.target.value))}>
            <option value={365}>365</option>
            <option value={252}>252</option>
          </select>
        </div>
      </div>

      {/* Volatility */}
      <div className="row">
        <div className="k">Volatility</div>
        <div className="v v-vol">
          <select className="select" value={volSrc} onChange={(e) => setVolSrc(e.target.value)} title="Vol source">
            <option value="iv">Imp</option>
            <option value="hist">Hist</option>
          </select>
          <span className={`value volval ${showVolSkeleton ? "is-pending" : ""}`} aria-live="polite">
            {Number.isFinite(sigma) ? `${(sigma * 100).toFixed(0)}%` : "—"}
          </span>
          {volDiag && <span className="meta small">{volDiag}</span>}
          {showVolSkeleton && <span className="skl" aria-hidden="true" />}
        </div>
      </div>

      {/* Beta */}
      <div className="row">
        <div className="k">Beta</div>
        <div className="v value">{Number.isFinite(beta) ? beta.toFixed(2) : "—"}</div>
      </div>

      {/* Dividend (q) */}
      <div className="row">
        <div className="k">Dividend (q)</div>
        <div className="v">
          <input
            className="input"
            placeholder="0.00"
            value={divPct}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^\d.]/g, "");
              if (raw === "" || /^\d{0,3}(\.\d{0,2})?$/.test(raw)) e.target.value && setDivPct(raw);
              if (raw === "") setDivPct("");
            }}
            onBlur={() => {
              const v = parsePctInput(divPct);
              setDivPct(Number.isFinite(v) ? (v * 100).toFixed(2) : "0.00");
            }}
          />
        </div>
      </div>

      {/* CAPM μ */}
      <div className="row">
        <div className="k">CAPM μ</div>
        <div className="v value">{Number.isFinite(muCapm) ? `${(muCapm * 100).toFixed(2)}%` : "—"}</div>
      </div>

      {/* Drift chooser */}
      <div className="row">
        <div className="k">Drift</div>
        <div className="v">
          <select
            className="select"
            value={driftMode}
            onChange={(e) => setDriftMode(e.target.value)}
            title="Choose drift"
          >
            <option value="CAPM">CAPM</option>
            <option value="RF">Risk-Free Rate</option>
          </select>
        </div>
      </div>

      {children}

      <style jsx>{`
        .row{
          display:grid;
          grid-template-columns: minmax(120px, 1fr) minmax(0, 520px);
          align-items:center;
          gap:16px;
          padding:10px 0;
          border-bottom:1px dashed var(--border, #2a2f3a);
          width:100%;
          box-sizing:border-box;
        }
        .row:last-of-type{ border-bottom:0; }
        .k{ font-size:14px; opacity:.75; min-width:0; }
        .v{
          display:flex; justify-content:flex-end; align-items:center; gap:10px;
          width:100%; min-width:0; flex-wrap:nowrap;
        }
        .v-expiry{ gap:12px; }
        .dte-pill{
          padding: 6px 10px;
          border: 1px solid var(--border, #2a2f3a);
          border-radius: 10px;
          background: var(--card, #111214);
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }
        .value{
          font-variant-numeric: tabular-nums; font-weight:600;
          white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
          max-width:100%;
        }
        .meta.small{ font-size:12px; opacity:.70; white-space:nowrap; }
        .select, .input{
          height:38px; padding:6px 12px; border-radius:10px;
          border:1px solid var(--border, #2a2f3a);
          background:var(--card, #111214); color:var(--foreground, #e5e7eb);
          font-size:14px; line-height:22px;
          width:100%; max-width:260px; min-width:0;
          box-sizing:border-box;
          transition:border-color 140ms ease, outline-color 140ms ease, background 140ms ease;
        }
        .select:hover, .input:hover{ border-color: var(--ring, #3b3f47); }
        .select:focus-visible, .input:focus-visible{
          outline:2px solid color-mix(in srgb, var(--text, #e5e7eb) 24%, transparent);
          outline-offset:2px;
        }
        .v-vol{ position:relative; }
        .volval{ min-width:48px; text-align:right; }
        .skl{
          position:absolute; right:10px; top:50%; height:10px; width:80px;
          transform:translateY(-50%); border-radius:7px;
          background: color-mix(in srgb, var(--text, #0f172a) 12%, var(--surface, #f7f9fc));
          overflow:hidden;
        }
        .skl::after{
          content:""; position:absolute; inset:0; transform:translateX(-100%);
          background:linear-gradient(90deg,transparent,rgba(255,255,255,.45),transparent);
          animation:shimmer 1.15s ease-in-out infinite;
        }
        .is-pending{ opacity:.6; }
        @media (prefers-color-scheme: light){
          .select, .input{
            border:1px solid var(--border, #e5e7eb);
            background:#fff; color:#111827;
          }
          .select:hover, .input:hover{ border-color:#a3a3a3; }
          .dte-pill{ background:#fff; color:#111827; border-color:#e5e7eb; }
        }
      `}</style>
    </aside>
  );
}