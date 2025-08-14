/* components/Strategy/StatsRail.jsx */
"use client";

/**
 * Key Stats — line layout with robust right column.
 * Boxes only for dropdowns (Time, Volatility source, Drift) and Dividend input.
 * All other values render as right-aligned text.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useTimeBasis } from "../ui/TimeBasisContext";

/* ===== helpers ===== */
const moneySign = (ccy) =>
  ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : ccy === "JPY" ? "¥" : "$";
const isNum = (x) => Number.isFinite(Number(x));
const parsePctInput = (str) => {
  const v = Number(String(str).replace("%", "").trim());
  return Number.isFinite(v) ? v / 100 : NaN;
};
const lastFromArray = (arr) => {
  if (!Array.isArray(arr) || !arr.length) return NaN;
  for (let i = arr.length - 1; i >= 0; i--) {
    const n = Number(arr[i]);
    if (Number.isFinite(n) && n > 0) return n;
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

/* ===== server calls ===== */
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
  let spot = Number(j?.regularMarketPrice);
  if (!Number.isFinite(spot) || spot <= 0) spot = await fetchSpotFromChart(j.symbol || sym);
  return { symbol: j.symbol || sym, currency, beta: typeof j.beta === "number" ? j.beta : null, spot: Number.isFinite(spot) ? spot : null };
}
async function fetchMarketBasics({ index = "^GSPC", currency = "USD", lookback = "2y" }) {
  try {
    const u = `/api/market/stats?index=${encodeURIComponent(index)}&currency=${encodeURIComponent(currency)}&lookback=${encodeURIComponent(lookback)}&basis=annual`;
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
    const u = `/api/beta/stats?symbol=${encodeURIComponent(sym)}&benchmark=${encodeURIComponent(benchmark)}&range=5y&interval=1mo`;
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
async function fetchVol(sym, mapped, { days, cmDays }, signal) {
  const tryOne = async (param) => {
    const params = new URLSearchParams();
    params.set("symbol", sym);
    params.set(param, mapped);          // source or volSource
    if (days != null) params.set("days", String(days));
    if (cmDays != null) params.set("cmDays", String(cmDays));
    const u = `/api/volatility?${params.toString()}`;
    const r = await fetch(u, { cache: "no-store", signal });
    const j = await r.json();
    if (!r.ok || j?.ok === false) throw new Error(j?.error || `Vol ${r.status}`);
    return j;
  };
  try { return await tryOne("source"); } catch { return await tryOne("volSource"); }
}

/* ===== CAPM: μ = r_f + β·ERP − q ===== */
const capmMu = (rf, beta, erp, q = 0) =>
  (Number(rf) || 0) + (Number(beta) || 0) * (Number(erp) || 0) - (Number(q) || 0);

export default function StatsRail({ spot: propSpot, currency: propCcy, company, market }) {
  const { basis, setBasis } = useTimeBasis();

  /* selection & basics */
  const [symbol, setSymbol] = useState(company?.symbol || "");
  const [currency, setCurrency] = useState(propCcy || company?.currency || "");
  const [spot, setSpot] = useState(propSpot ?? null);

  /* market/capm */
  const [rf, setRf] = useState(typeof market?.riskFree === "number" ? market.riskFree : null);
  const [erp, setErp] = useState(typeof market?.mrp === "number" ? market.mrp : null);
  const [beta, setBeta] = useState(Number.isFinite(company?.beta) ? company.beta : null);
  const [divPct, setDivPct] = useState("0.00");
  const qDec = useMemo(() => {
    const n = parsePctInput(divPct);
    return Number.isFinite(n) ? n : 0;
  }, [divPct]);

  /* volatility */
  const [volSrc, setVolSrc] = useState("iv"); // iv | hist | manual
  const [histDays, setHistDays] = useState(30); // shown only when "hist"
  const CM_DEFAULT = 30; // constant-maturity target for implied
  const [sigma, setSigma] = useState(null);
  const [volMeta, setVolMeta] = useState(null);
  const [volLoading, setVolLoading] = useState(false);
  const volAbortRef = useRef(null);
  const volSeqRef = useRef(0);
  const cancelVol = () => { try { volAbortRef.current?.abort(); } catch {} volAbortRef.current = null; setVolLoading(false); };

  /* derived */
  const muCapm = useMemo(() => capmMu(rf, beta, erp, qDec), [rf, beta, erp, qDec]);

  const volTag = useMemo(() => {
    if (volSrc === "hist") return `Hist (${histDays}d)`;
    if (volSrc === "iv") return `Imp (${CM_DEFAULT}d)`;
    return "Manual";
  }, [volSrc, histDays]);

  const volDiag = useMemo(() => {
    if (!volMeta) return "";
    const parts = [];
    if (volMeta.method) parts.push(String(volMeta.method));
    if (volSrc === "hist") {
      if (Number.isFinite(volMeta.pointsUsed)) parts.push(`n=${volMeta.pointsUsed}`);
      parts.push(`win=${histDays}d`);
    } else if (volSrc === "iv") {
      if (Number.isFinite(volMeta.cmDays)) parts.push(`cm=${volMeta.cmDays}d`);
    }
    if (volMeta.fallback) parts.push("fallback");
    return parts.join(" · ");
  }, [volMeta, volSrc, histDays]);

  /* listen to navbar ticker selections */
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

  /* hydrate when symbol known */
  useEffect(() => {
    if (!symbol) return;
    let mounted = true;
    (async () => {
      try {
        const c = await fetchCompany(symbol);
        if (!mounted) return;
        if (c.currency) setCurrency(c.currency);
        if (isNum(c.spot)) setSpot(c.spot);
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
            const j = await fetchVol(symbol, mapped, { days: volSrc === "hist" ? histDays : CM_DEFAULT, cmDays: volSrc === "iv" ? CM_DEFAULT : undefined }, ac.signal);
            if (ac.signal.aborted || mySeq !== volSeqRef.current) return;
            setSigma(j?.sigmaAnnual ?? null);
            setVolMeta(j?.meta || null);
          } finally {
            if (mySeq === volSeqRef.current) { setVolLoading(false); volAbortRef.current = null; }
          }
        }
      } catch { /* leave as "—" */ }
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  /* honor market props if provided */
  useEffect(() => {
    if (typeof market?.riskFree === "number") setRf(market.riskFree);
    if (typeof market?.mrp === "number") setErp(market.mrp);
  }, [market?.riskFree, market?.mrp]);

  /* re-fetch vol on source or horizon change */
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
        const j = await fetchVol(
          symbol,
          mapped,
          { days: volSrc === "hist" ? histDays : CM_DEFAULT, cmDays: volSrc === "iv" ? CM_DEFAULT : undefined },
          ac.signal
        );
        if (ac.signal.aborted || mySeq !== volSeqRef.current) return;
        setSigma(j?.sigmaAnnual ?? null);
        setVolMeta(j?.meta || null);
      } catch {} finally {
        if (mySeq === volSeqRef.current) { setVolLoading(false); volAbortRef.current = null; }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volSrc, symbol, histDays]);

  /* live price pulse */
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
      <div className="row">
        <div className="k">Current Price</div>
        <div className="v value">
          {isNum(spot) ? `${moneySign(currency)}${Number(spot).toFixed(2)}` : "—"}
        </div>
      </div>

      {/* Currency (text) */}
      <div className="row">
        <div className="k">Currency</div>
        <div className="v value">{currency || "—"}</div>
      </div>

      {/* Time (dropdown) */}
      <div className="row">
        <div className="k">Time</div>
        <div className="v">
          <select className="select" value={basis} onChange={(e) => setBasis(Number(e.target.value))}>
            <option value={365}>365</option>
            <option value={252}>252</option>
          </select>
        </div>
      </div>

      {/* Volatility (source + horizon + value) */}
      <div className="row">
        <div className="k">Volatility</div>
        <div className="v v-vol">
          <select
            className="select"
            value={volSrc}
            onChange={(e) => setVolSrc(e.target.value)}
            title="Volatility source"
          >
            <option value="iv">Imp</option>
            <option value="hist">Hist</option>
            <option value="manual">Manual</option>
          </select>

          {volSrc === "hist" && (
            <select
              className="select select-compact"
              value={histDays}
              onChange={(e) => setHistDays(Number(e.target.value))}
              title="Historical window"
            >
              <option value={20}>20d</option>
              <option value={30}>30d</option>
              <option value={60}>60d</option>
              <option value={90}>90d</option>
            </select>
          )}

          <span className={`tag tiny`} aria-label="vol horizon">{volTag}</span>

          <span className={`value volval ${showVolSkeleton ? "is-pending" : ""}`}>
            {Number.isFinite(sigma) ? `${(sigma * 100).toFixed(0)}%` : "—"}
          </span>
          {showVolSkeleton && <span className="skl" aria-hidden="true" />}
        </div>
      </div>

      {/* Volatility diagnostics (subtle, single line) */}
      <div className="row row-diag">
        <div className="k">Vol. meta</div>
        <div className="v">
          <span className="small muted">{volDiag || "—"}</span>
        </div>
      </div>

      {/* Beta (text) */}
      <div className="row">
        <div className="k">Beta</div>
        <div className="v value">{Number.isFinite(beta) ? beta.toFixed(2) : "—"}</div>
      </div>

      {/* Dividend (q) — input */}
      <div className="row">
        <div className="k">Dividend (q)</div>
        <div className="v">
          <input
            className="input"
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
      </div>

      {/* CAPM μ (text) */}
      <div className="row">
        <div className="k">CAPM μ</div>
        <div className="v value">{Number.isFinite(muCapm) ? `${(muCapm * 100).toFixed(2)}%` : "—"}</div>
      </div>

      {/* Drift (dropdown) */}
      <div className="row">
        <div className="k">Drift</div>
        <div className="v">
          <select className="select" defaultValue="CAPM" title="Choose which drift to apply elsewhere">
            <option value="CAPM">CAPM</option>
            <option value="RF">Risk-Free Rate</option>
          </select>
        </div>
      </div>

      <style jsx>{`
        /* rows — resilient two-column grid */
        .row{
          display:grid;
          grid-template-columns: minmax(120px, 1fr) minmax(0, 420px);
          align-items:center;
          gap:16px;
          padding:10px 0;
          border-bottom:1px dashed var(--border, #2a2f3a);
          box-sizing:border-box;
          width:100%;
        }
        .row:last-of-type{ border-bottom:0; }
        .row-diag{ padding-top:6px; padding-bottom:6px; }

        .k{ font-size:14px; opacity:.75; min-width:0; }
        .v{
          display:flex; justify-content:flex-end; align-items:center; gap:10px;
          width:100%; min-width:0;
          flex-wrap:nowrap;
        }
        .value{
          font-variant-numeric: tabular-nums; font-weight:600;
          white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
          max-width:100%;
        }

        /* dropdowns / inputs — constrained to avoid pushing the grid */
        .select, .input{
          height:38px; padding:6px 12px; border-radius:10px;
          border:1px solid var(--border, #2a2f3a);
          background:var(--card, #111214); color:var(--foreground, #e5e7eb);
          font-size:14px; line-height:22px;
          width:100%; max-width:220px; min-width:0;
          box-sizing:border-box;
          transition:border-color 140ms ease, outline-color 140ms ease, background 140ms ease;
        }
        .select:hover, .input:hover{ border-color: var(--ring, #3b3f47); }
        .select:focus-visible, .input:focus-visible{
          outline:2px solid color-mix(in srgb, var(--text, #e5e7eb) 24%, transparent);
          outline-offset:2px;
        }

        /* compact second select for hist window */
        .select-compact{ max-width:100px; }

        /* tiny horizon tag */
        .tag{
          display:inline-flex; align-items:center; justify-content:center;
          height:22px; padding:0 8px;
          border-radius:9999px;
          border:1px solid var(--border);
          background:transparent;
          font-size:12px; font-weight:600;
          color:var(--muted);
          white-space:nowrap;
        }
        .tiny{ font-size:12px; }

        /* volatility value skeleton */
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
        @keyframes shimmer{ 100% { transform: translateX(100%); } }
        .is-pending{ opacity:.6; }

        @media (prefers-color-scheme: light){
          .select, .input{
            border:1px solid var(--border, #e5e7eb);
            background:#fff; color:#111827;
          }
          .select:hover, .input:hover{ border-color:#a3a3a3; }
        }
      `}</style>
    </aside>
  );
}
