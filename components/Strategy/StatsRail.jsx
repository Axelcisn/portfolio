// components/Strategy/StatsRail.jsx
"use client";

/**
 * Key Stats — definitive panel.
 * Becomes the single place for company inputs & metrics:
 *  - Current Price
 *  - Currency (display)
 *  - Time basis (365/252)
 *  - Volatility (source + value or manual)
 *  - Beta (read-only)
 *  - Dividend yield q (input as percent)
 *  - CAPM μ (read-only)
 *  - Drift selector (CAPM | RF)
 *
 * It listens to the global "app:ticker-picked" event (from the navbar),
 * and can also accept initial props (spot, currency, company, market).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useTimeBasis } from "../ui/TimeBasisContext";

/* ---- small helpers ---- */
const moneySign = (ccy) => (ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : ccy === "JPY" ? "¥" : "$");
const isNum = (x) => Number.isFinite(Number(x));
const lastFromArray = (arr) => {
  if (!Array.isArray(arr) || !arr.length) return NaN;
  for (let i = arr.length - 1; i >= 0; i--) {
    const n = Number(arr[i]); if (Number.isFinite(n) && n > 0) return n;
  }
  return NaN;
};
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
const parsePctInput = (str) => {
  const v = Number(String(str).replace("%", "").trim());
  return Number.isFinite(v) ? v / 100 : NaN;
};

/* ---- server helpers ---- */
async function fetchSpotFromChart(sym) {
  try {
    const u = `/api/chart?symbol=${encodeURIComponent(sym)}&range=1d&interval=1m`;
    const r = await fetch(u, { cache: "no-store" });
    const j = await r.json();
    if (!r.ok || j?.ok === false) throw new Error(j?.error || `Chart ${r.status}`);
    const last = pickLastClose(j);
    return Number.isFinite(last) ? last : null;
  } catch { return null; }
}
async function fetchCompany(sym) {
  const r = await fetch(`/api/company?symbol=${encodeURIComponent(sym)}`, { cache: "no-store" });
  const j = await r.json();
  if (!r.ok || j?.ok === false) throw new Error(j?.error || `Company ${r.status}`);
  const currency =
    j.currency || j.ccy || j?.quote?.currency || j?.price?.currency || j?.meta?.currency || "";
  const beta = typeof j.beta === "number" ? j.beta : null;
  let spot = Number(j?.regularMarketPrice);
  if (!Number.isFinite(spot) || spot <= 0) {
    spot = await fetchSpotFromChart(j.symbol || sym);
  }
  return { symbol: j.symbol || sym, currency, beta, spot: Number.isFinite(spot) ? spot : null };
}
async function fetchMarketBasics({ index = "^GSPC", currency = "USD", lookback = "2y" }) {
  try {
    const u = `/api/market/stats?index=${encodeURIComponent(index)}&currency=${encodeURIComponent(
      currency
    )}&lookback=${encodeURIComponent(lookback)}&basis=annual`;
    const r = await fetch(u, { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error || `Market ${r.status}`);
    return {
      rAnnual: typeof j?.riskFree?.r === "number" ? j.riskFree.r : null,
      erp: typeof j?.mrp === "number" ? j.mrp : null,
      indexAnn: typeof j?.indexAnn === "number" ? j.indexAnn : null,
    };
  } catch { return { rAnnual: null, erp: null, indexAnn: null }; }
}
async function fetchBetaStats(sym, benchmark = "^GSPC") {
  try {
    const u = `/api/beta/stats?symbol=${encodeURIComponent(sym)}&benchmark=${encodeURIComponent(
      benchmark
    )}&range=5y&interval=1mo`;
    const r = await fetch(u, { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error || `Beta ${r.status}`);
    const b = typeof j?.beta === "number" ? j.beta : null;
    if (b == null) throw new Error("no_beta");
    return b;
  } catch {
    try {
      const rc = await fetch(`/api/company?symbol=${encodeURIComponent(sym)}`, { cache: "no-store" });
      const jc = await rc.json();
      if (!rc.ok) throw new Error(jc?.error || `Company ${rc.status}`);
      return typeof jc?.beta === "number" ? jc.beta : null;
    } catch { return null; }
  }
}
async function fetchVol(sym, mapped, d, signal) {
  // mapped: "historical" | "live"
  const uTry = async (param) => {
    const u = `/api/volatility?symbol=${encodeURIComponent(sym)}&${param}=${encodeURIComponent(mapped)}&days=${encodeURIComponent(d)}`;
    const r = await fetch(u, { cache: "no-store", signal });
    const j = await r.json();
    if (!r.ok || j?.ok === false) throw new Error(j?.error || `Vol ${r.status}`);
    return j;
  };
  try { return await uTry("source"); } catch { return await uTry("volSource"); }
}

/* ---- CAPM ----
   μ = r_f + β · ERP − q
*/
const capmMu = (rf, beta, erp, q = 0) =>
  (Number(rf) || 0) + (Number(beta) || 0) * (Number(erp) || 0) - (Number(q) || 0);

export default function StatsRail({ spot: propSpot, currency: propCcy, company, market }) {
  /* global horizon basis */
  const { basis, setBasis } = useTimeBasis();

  /* selection & basics */
  const [symbol, setSymbol] = useState(company?.symbol || "");
  const [currency, setCurrency] = useState(propCcy || company?.currency || "");
  const [spot, setSpot] = useState(propSpot ?? null);

  /* market/capm */
  const [rf, setRf] = useState(typeof market?.riskFree === "number" ? market.riskFree : null);
  const [erp, setErp] = useState(typeof market?.mrp === "number" ? market.mrp : null);
  const [beta, setBeta] = useState(isNum(company?.beta) ? company.beta : null);
  const [divPct, setDivPct] = useState("0.00");
  const qDec = useMemo(() => {
    const n = parsePctInput(divPct);
    return Number.isFinite(n) ? n : 0;
  }, [divPct]);

  /* volatility */
  const [volSrc, setVolSrc] = useState("iv");  // iv | hist | manual
  const [sigma, setSigma] = useState(null);
  const [volMeta, setVolMeta] = useState(null);
  const [volLoading, setVolLoading] = useState(false);
  const volAbortRef = useRef(null);
  const volSeqRef = useRef(0);
  const cancelVol = () => { try { volAbortRef.current?.abort(); } catch {} volAbortRef.current = null; setVolLoading(false); };

  /* derived capm μ */
  const muCapm = useMemo(() => capmMu(rf, beta, erp, qDec), [rf, beta, erp, qDec]);

  /* ticker selection from navbar */
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

  /* when symbol becomes known, hydrate company + market + vol */
  useEffect(() => {
    if (!symbol) return;

    let mounted = true;
    (async () => {
      try {
        const c = await fetchCompany(symbol);
        if (!mounted) return;
        if (c.currency) setCurrency(c.currency);
        if (isNum(c.spot)) setSpot(c.spot);

        // market basics (rf, erp)
        const mb = await fetchMarketBasics({ index: "^GSPC", currency: c.currency || "USD", lookback: "2y" });
        if (!mounted) return;
        if (mb.rAnnual != null) setRf(mb.rAnnual);
        if (mb.erp != null) setErp(mb.erp);

        // beta for ^GSPC default
        const b = await fetchBetaStats(symbol, "^GSPC");
        if (!mounted) return;
        if (b != null) setBeta(b);

        // volatility (default "iv")
        if (volSrc !== "manual") {
          cancelVol();
          const ac = new AbortController();
          volAbortRef.current = ac;
          const mySeq = ++volSeqRef.current;
          setVolLoading(true);
          try {
            const mapped = volSrc === "hist" ? "historical" : "live";
            const j = await fetchVol(symbol, mapped, 30, ac.signal);
            if (ac.signal.aborted || mySeq !== volSeqRef.current) return;
            setSigma(j?.sigmaAnnual ?? null);
            setVolMeta(j?.meta || null);
          } finally {
            if (mySeq === volSeqRef.current) { setVolLoading(false); volAbortRef.current = null; }
          }
        }
      } catch {
        // let empty states render as "—"
      }
    })();

    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  /* if parent supplies/changes market props, honor them */
  useEffect(() => {
    if (typeof market?.riskFree === "number") setRf(market.riskFree);
    if (typeof market?.mrp === "number") setErp(market.mrp);
  }, [market?.riskFree, market?.mrp]);

  /* re-fetch vol on source change (for known symbol) */
  useEffect(() => {
    if (!symbol || volSrc === "manual") { cancelVol(); return; }
    const run = async () => {
      cancelVol();
      const ac = new AbortController();
      volAbortRef.current = ac;
      const mySeq = ++volSeqRef.current;
      setVolLoading(true);
      try {
        const mapped = volSrc === "hist" ? "historical" : "live";
        const j = await fetchVol(symbol, mapped, 30, ac.signal);
        if (ac.signal.aborted || mySeq !== volSeqRef.current) return;
        setSigma(j?.sigmaAnnual ?? null);
        setVolMeta(j?.meta || null);
      } catch {
        // leave as is; shows "—"
      } finally {
        if (mySeq === volSeqRef.current) { setVolLoading(false); volAbortRef.current = null; }
      }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volSrc, symbol]);

  /* live price pulse (15s) */
  useEffect(() => {
    if (!symbol) return;
    let stop = false, id;
    const tick = async () => {
      const px = await fetchSpotFromChart(symbol);
      if (!stop && isNum(px)) setSpot(px);
      id = setTimeout(tick, 15000);
    };
    tick();
    return () => { stop = true; clearTimeout(id); };
  }, [symbol]);

  const showVolSkeleton =
    volSrc !== "manual" && symbol && (volLoading || !Number.isFinite(sigma));

  return (
    <aside className="card">
      <h3>Key stats</h3>

      {/* Current Price */}
      <div className="kv price-only">
        <div className="stat-row">
          <div className="k">Current Price</div>
          <div className="v">
            {isNum(spot) ? `${moneySign(currency)}${Number(spot).toFixed(2)}` : "—"}
          </div>
        </div>
      </div>

      {/* Inputs & Metrics (migrated from Company Card) */}
      <div className="inputs-grid">
        {/* Currency */}
        <div className="fg fg-currency">
          <label>Currency</label>
          <input className="field" value={currency || "—"} readOnly />
        </div>

        {/* Time basis */}
        <div className="fg fg-time">
          <label>Time</label>
          <select
            className="field"
            aria-label="Time basis"
            value={basis}
            onChange={(e) => setBasis(Number(e.target.value))}
          >
            <option value={365}>365</option>
            <option value={252}>252</option>
          </select>
        </div>

        {/* Volatility */}
        <div className="fg fg-vol">
          <label>Volatility</label>
          <div className="vol-wrap" aria-busy={showVolSkeleton ? "true" : "false"}>
            <select
              className="field"
              value={volSrc}
              onChange={(e) => setVolSrc(e.target.value)}
              title="Volatility source"
            >
              <option value="iv">Imp</option>
              <option value="hist">Hist</option>
              <option value="manual">Manual</option>
            </select>

            {volSrc === "manual" ? (
              <input
                className="field"
                placeholder="0.30"
                value={Number.isFinite(sigma) ? (sigma ?? 0) : ""}
                onChange={(e) => {
                  const v = parsePctInput(e.target.value);
                  setSigma(Number.isFinite(v) ? v : null);
                }}
              />
            ) : (
              <input
                className={`field ${showVolSkeleton ? "is-pending" : ""}`}
                readOnly
                value={Number.isFinite(sigma) ? `${(sigma * 100).toFixed(0)}%` : "—"}
              />
            )}

            {/* inline spinner + shimmer */}
            <span className={`vol-spin ${volLoading ? "is-on" : ""}`} aria-hidden="true" />
            {showVolSkeleton && <span className="skl w-80" aria-hidden="true" />}
          </div>

          <div className="small muted meta-line">
            {volSrc === "iv" && volMeta?.expiry
              ? `IV @ ${volMeta.expiry}${volMeta?.fallback ? " · fallback used" : ""}`
              : volSrc === "hist" && volMeta?.pointsUsed
              ? `Hist 30d (n=${volMeta.pointsUsed})${volMeta?.fallback ? " · fallback used" : ""}`
              : ""}
          </div>
        </div>

        {/* Beta */}
        <div className="fg fg-beta">
          <label>Beta</label>
          <input className="field" value={Number.isFinite(beta) ? beta.toFixed(2) : "—"} readOnly />
        </div>

        {/* Dividend (q) */}
        <div className="fg fg-div">
          <label>Dividend (q)</label>
          <input
            className="field"
            placeholder="0.00"
            value={divPct}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^\d.]/g, "");
              if (raw === "" || /^\d{0,3}(\.\d{0,2})?$/.test(raw)) setDivPct(raw);
            }}
            onBlur={() => {
              const v = parsePctInput(divPct);
              setDivPct(Number.isFinite(v) ? (v * 100).toFixed(2) : "0.00");
            }}
          />
        </div>

        {/* CAPM μ */}
        <div className="fg fg-mu">
          <label>CAPM μ</label>
          <input
            className="field"
            value={Number.isFinite(muCapm) ? `${(muCapm * 100).toFixed(2)}%` : "—"}
            readOnly
          />
        </div>

        {/* Drift */}
        <div className="fg fg-drift">
          <label>Drift</label>
          <select
            className="field"
            defaultValue="CAPM"
            title="Choose which drift to apply elsewhere"
          >
            <option value="CAPM">CAPM</option>
            <option value="RF">Risk-Free Rate</option>
          </select>
        </div>
      </div>

      <style jsx>{`
        .kv{ display:grid; gap:6px; }
        .stat-row{
          display:flex; align-items:baseline; justify-content:space-between;
          padding:8px 0; border-bottom:1px dashed var(--border);
        }
        .stat-row:last-child{ border-bottom:0; }
        .k{ font-size:12px; opacity:.75; }
        .v{ font-variant-numeric: tabular-nums; font-weight:600; }

        /* Prevent horizontal bleed */
        .inputs-grid{ margin-top:14px; overflow-x: clip; }

        /* Definitive, measured desktop grid to avoid overflow/odd spacing */
        .inputs-grid{
          display:grid;
          grid-template-columns:
            120px   /* Currency */
            120px   /* Time */
            320px   /* Volatility pair */
            120px   /* Beta */
            1fr     /* q */
            1fr     /* CAPM μ */
            1fr;    /* Drift */
          gap: 12px;
          align-items:end;
          width:100%;
          max-width:100%;
          box-sizing:border-box;
        }

        .fg{ display:grid; gap:6px; min-width:0; }
        .fg-currency{ grid-column:1; }
        .fg-time{ grid-column:2; }
        .fg-vol{ grid-column:3; }
        .fg-beta{ grid-column:4; }
        .fg-div{ grid-column:5; }
        .fg-mu{ grid-column:6; }
        .fg-drift{ grid-column:7; }

        /* Two neat rows below 1440px */
        @media (max-width:1440px){
          .inputs-grid{
            grid-template-columns: 140px 120px 280px 120px 1fr 1fr;
          }
          .fg-drift{ grid-column: 1 / -1; max-width: 420px; }
        }

        /* Controls — compact & consistent */
        .field{
          height:42px; padding:8px 12px; border-radius:12px;
          border:1px solid var(--border, #2a2f3a);
          background: var(--card, #111214);
          color: var(--foreground, #e5e7eb);
          font-size:14px; line-height:22px; width:100%; box-sizing:border-box;
          appearance:none; -webkit-appearance:none; -moz-appearance:none;
          transition: border-color 140ms ease, outline-color 140ms ease;
          font-variant-numeric: tabular-nums;
        }
        .field:hover{ border-color: var(--ring, #3b3f47); }
        .field:focus-visible{
          outline:2px solid color-mix(in srgb, var(--text,#e5e7eb) 24%, transparent);
          outline-offset:2px;
        }

        /* Volatility pair */
        .vol-wrap{
          position:relative; display:grid; grid-template-columns:1fr 1fr;
          gap:10px; align-items:center; min-width:0;
        }
        .vol-spin{
          position:absolute; right:12px; top:50%; margin-top:-8px;
          width:16px; height:16px; border-radius:50%;
          border:2px solid transparent;
          border-top-color: color-mix(in srgb, var(--text,#0f172a) 60%, var(--card,#fff));
          opacity:0; pointer-events:none; animation: vs-rot .9s linear infinite;
          transition: opacity 120ms ease;
        }
        .vol-spin.is-on{ opacity:1; }
        @keyframes vs-rot{ to { transform: rotate(360deg); } }

        .skl{
          position:absolute; right:44px; top:50%; height:10px; width:96px;
          transform: translateY(-50%); border-radius: 8px;
          background: color-mix(in srgb, var(--text,#0f172a) 12%, var(--surface,#f7f9fc));
          overflow:hidden;
        }
        .skl::after{
          content:""; position:absolute; inset:0; transform:translateX(-100%);
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.45), transparent);
          animation: shimmer 1.15s ease-in-out infinite;
        }
        .field.is-pending{ color: color-mix(in srgb, var(--text,#0f172a) 60%, var(--card,#fff)); }

        /* Light mode */
        @media (prefers-color-scheme: light){
          .field{
            border:1px solid var(--border,#e5e7eb);
            background:var(--card,#fff);
            color:var(--foreground,#111827);
          }
          .field:hover{ border-color: var(--ring,#a3a3a3); }
        }
      `}</style>
    </aside>
  );
}
