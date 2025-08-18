// components/Strategy/MarketCard.jsx
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { fmtPct } from "../../utils/format";

/* Expanded index list (labels only) */
const INDICES = [
  { key: "SPX",    label: "S&P 500 (SPX)" },
  { key: "NDX",    label: "NASDAQ 100 (NDX)" },
  { key: "DJI",    label: "Dow Jones (DJI)" },
  { key: "RUT",    label: "Russell 2000 (RUT)" },
  { key: "STOXX",  label: "STOXX Europe 600 (STOXX)" },
  { key: "SX5E",   label: "EURO STOXX 50 (SX5E)" },
  { key: "FTSE",   label: "FTSE 100 (FTSE)" },
  { key: "N225",   label: "Nikkei 225 (N225)" },
  { key: "SSMI",   label: "SMI Switzerland (SSMI)" },
  { key: "GSPTSE", label: "TSX Composite (GSPTSE)" },
];

const LOOKS = ["1y", "2y", "3y", "5y", "10y"];

/* % input helpers */
const pctPattern = /^(\d{0,3})(?:\.(\d{0,2})?)?$/;
const sanitizePct = (raw) => raw.replace(/[^\d.]/g, "");
const canAccept = (raw) => raw === "" || pctPattern.test(raw);
const stripTrailingDot = (raw) => (raw.endsWith(".") ? raw.slice(0, -1) : raw);
const toDec = (pctStr) => {
  const v = stripTrailingDot(pctStr);
  const n = v === "" ? null : parseFloat(v);
  return n == null || !isFinite(n) ? null : n / 100;
};

/* --- Helpers to auto-align RF/MRP + Index by company origin --- */
const CCY_MAP = {
  USD: { index: "SPX",    currency: "USD" },
  EUR: { index: "STOXX",  currency: "EUR" },
  GBP: { index: "FTSE",   currency: "GBP" },
  CHF: { index: "SSMI",   currency: "CHF" },
  CAD: { index: "GSPTSE", currency: "CAD" },
  JPY: { index: "N225",   currency: "JPY" },
};
/* loose exchange fallback if currency is missing */
const EX_TO_CCY = {
  NMS: "USD", NGM: "USD", NCM: "USD", NYQ: "USD", ASE: "USD", PCX: "USD",
  LSE: "GBP",
  SWX: "CHF", EBS: "CHF", VTX: "CHF",
  TOR: "CAD", TSX: "CAD",
  TYO: "JPY", JPX: "JPY",
  MIL: "EUR", BIT: "EUR", XETRA: "EUR", FWB: "EUR", PA: "EUR", EPA: "EUR", AMS: "EUR", BRU: "EUR", LIS: "EUR", MAD: "EUR",
};

async function fetchCompanyLight(symbol) {
  try {
    const r = await fetch(`/api/company?symbol=${encodeURIComponent(symbol)}`, { cache: "no-store" });
    const j = await r.json();
    return {
      currency: j?.currency || j?.ccy || j?.price?.currency || j?.quote?.currency || "",
      exchange: (j?.exchange || j?.exchangeName || j?.ex || j?.exch || "").toUpperCase(),
    };
  } catch {
    return { currency: "", exchange: "" };
  }
}

function decideOrigin(meta) {
  const ccy = (meta?.currency || "").toUpperCase();
  if (CCY_MAP[ccy]) return CCY_MAP[ccy];
  const exCcy = EX_TO_CCY[(meta?.exchange || "").toUpperCase()];
  if (exCcy && CCY_MAP[exCcy]) return CCY_MAP[exCcy];
  /* default: do not change selection */
  return null;
}

export default function MarketCard({
  onRates,
  currency: propCcy = "USD",
  onBenchmarkChange,
}) {
  // UI stores percent strings; we emit decimals to parent
  const [riskFreePct, setRiskFreePct] = useState("");
  const [mrpPct, setMrpPct] = useState("");

  // Index avg return controls
  const [indexKey, setIndexKey] = useState("STOXX");
  const [lookback, setLookback] = useState("2y");
  const [indexAnn, setIndexAnn] = useState(null);

  // Track currency used for fetching market stats (starts from prop; auto-adjusts on ticker pick)
  const [ccy, setCcy] = useState(propCcy);
  useEffect(() => { setCcy(propCcy); }, [propCcy]);

  // Auto/Manual for RF/MRP
  const [autoRF, setAutoRF] = useState(true);
  const [autoMRP, setAutoMRP] = useState(true);

  // Loading states
  const [loadingStats, setLoadingStats] = useState(false);
  const [loadingIndex, setLoadingIndex] = useState(false);

  const riskFreeDec = useMemo(() => toDec(riskFreePct), [riskFreePct]);
  const mrpDec      = useMemo(() => toDec(mrpPct),      [mrpPct]);

  const abortRef = useRef(null);
  const debounceRef = useRef(null);

  function emitRates(next = {}) {
    onRates?.({
      riskFree: riskFreeDec ?? 0,
      mrp:      mrpDec ?? 0,
      indexAnn,
      indexKey,
      ...next,
    });
  }

  async function fetchStats({ index = indexKey, lb = lookback, currency = ccy } = {}) {
    const qs = new URLSearchParams({
      index,
      lookback: lb,
      currency,
      basis: "annual",
    }).toString();

    // cancel in-flight
    try { abortRef.current?.abort(); } catch {}
    const ac = new AbortController();
    abortRef.current = ac;

    // set loading flags
    setLoadingStats(true);
    setLoadingIndex(true);

    try {
      const r = await fetch(`/api/market/stats?${qs}`, { cache: "no-store", signal: ac.signal });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || `Market ${r.status}`);

      // auto-fill RF / ERP if toggled
      if (autoRF && typeof d?.riskFree?.r === "number") {
        setRiskFreePct((d.riskFree.r * 100).toFixed(2));
      }
      if (autoMRP && typeof d?.mrp === "number") {
        setMrpPct((d.mrp * 100).toFixed(2));
      }

      // index annualized mean: prefer top-level, fallback to stats.mu_geom
      const ix =
        typeof d?.indexAnn === "number"
          ? d.indexAnn
          : typeof d?.stats?.mu_geom === "number"
          ? d.stats.mu_geom
          : null;
      setIndexAnn(ix);

      // emit snapshot (decimals)
      emitRates({
        riskFree: autoRF ? d?.riskFree?.r ?? riskFreeDec ?? 0 : riskFreeDec ?? 0,
        mrp:      autoMRP ? d?.mrp ?? mrpDec ?? 0 : mrpDec ?? 0,
        indexAnn: ix,
      });
    } catch {
      /* keep previous values on error */
    } finally {
      if (!ac.signal.aborted) {
        setLoadingStats(false);
        setLoadingIndex(false);
      }
    }
  }

  // Initial fetch
  useEffect(() => {
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch when index/lookback/auto flags/currency change (debounced)
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchStats(), 250);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indexKey, lookback, ccy, autoRF, autoMRP]);

  // Mirror index changes to optional external listeners
  useEffect(() => {
    onBenchmarkChange?.(indexKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indexKey]);

  // React to ticker picks -> auto align by company origin (via currency/exchange)
  useEffect(() => {
    const onPick = async (e) => {
      const sym = (e?.detail?.symbol || "").toUpperCase();
      if (!sym) return;
      try {
        const meta = await fetchCompanyLight(sym);
        const pick = decideOrigin(meta);
        if (pick) {
          setCcy(pick.currency);
          setIndexKey((cur) => (cur === pick.index ? cur : pick.index));
        }
      } catch { /* ignore */ }
    };
    window.addEventListener("app:ticker-picked", onPick);
    return () => window.removeEventListener("app:ticker-picked", onPick);
  }, []);

  const commitRF  = () => emitRates();
  const commitMRP = () => emitRates();

  return (
    <section className="card market">
      <h3>Market</h3>

      <div className="market-stack">
        {/* Row 1 — Risk-Free Rate */}
        <div className="vgroup">
          <label>Risk-Free Rate</label>
          <div className="row">
            <input
              className="field"
              inputMode="decimal"
              placeholder="e.g., 2.00"
              value={riskFreePct}
              readOnly={autoRF}
              onChange={(e) => {
                const raw = sanitizePct(e.target.value);
                if (canAccept(raw)) setRiskFreePct(raw);
              }}
              onBlur={() => {
                if (riskFreePct === "") return commitRF();
                const v = stripTrailingDot(riskFreePct);
                const n = parseFloat(v);
                setRiskFreePct(isFinite(n) ? n.toFixed(2) : "");
                commitRF();
              }}
            />
            <div className="toggles">
              <button
                className={`pill ${autoRF ? "on" : ""}`}
                title="Auto update from source"
                onClick={() => setAutoRF((s) => !s)}
              >
                Auto
              </button>
              <button
                className={`icon ${loadingStats ? "spin" : ""}`}
                title="Refresh"
                onClick={() => fetchStats()}
                aria-busy={loadingStats ? "true" : "false"}
              >
                ↻
              </button>
            </div>
          </div>
        </div>

        {/* Row 2 — Market Risk Premium */}
        <div className="vgroup">
          <label>Market Risk Premium</label>
          <div className="row">
            <input
              className="field"
              inputMode="decimal"
              placeholder="e.g., 5.50"
              value={mrpPct}
              readOnly={autoMRP}
              onChange={(e) => {
                const raw = sanitizePct(e.target.value);
                if (canAccept(raw)) setMrpPct(raw);
              }}
              onBlur={() => {
                if (mrpPct === "") return commitMRP();
                const v = stripTrailingDot(mrpPct);
                const n = parseFloat(v);
                setMrpPct(isFinite(n) ? n.toFixed(2) : "");
                commitMRP();
              }}
            />
            <div className="toggles">
              <button
                className={`pill ${autoMRP ? "on" : ""}`}
                title="Auto update from source"
                onClick={() => setAutoMRP((s) => !s)}
              >
                Auto
              </button>
              <button
                className={`icon ${loadingStats ? "spin" : ""}`}
                title="Refresh"
                onClick={() => fetchStats()}
                aria-busy={loadingStats ? "true" : "false"}
              >
                ↻
              </button>
            </div>
          </div>
        </div>

        {/* Row 3 — Index Average Return (controls left; % value right) */}
        <div className="vgroup">
          <label>Index Average Return</label>
          <div className="index-row">
            <div className="row">
              <select
                className="field"
                value={indexKey}
                onChange={(e) => setIndexKey(e.target.value)}
                style={{ width: 260 }}
              >
                {INDICES.map((i) => (
                  <option key={i.key} value={i.key}>{i.label}</option>
                ))}
              </select>

              <select
                className="field"
                value={lookback}
                onChange={(e) => setLookback(e.target.value)}
                style={{ width: 120 }}
              >
                {LOOKS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>

            <div className="value" style={{ textAlign: "right", position: "relative", minWidth: 80 }}>
              {loadingIndex ? (
                <span className="skl" aria-hidden="true" />
              ) : indexAnn == null ? "—" : fmtPct(indexAnn)}
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .market-stack{ display:grid; gap:14px; }
        .vgroup{ display:grid; gap:6px; }
        .row{ display:flex; gap:10px; align-items:center; }
        .field{
          height: 42px;
          padding: 8px 12px;
          border-radius: 12px;
          border: 1px solid var(--border, #2a2f3a);
          background: var(--card, #111214);
          color: var(--foreground, #e5e7eb);
          font-size: 14px; line-height: 22px;
          box-sizing: border-box;
          transition: border-color 140ms ease, outline-color 140ms ease, background 140ms ease;
        }
        .field:hover{ border-color: var(--ring, #3b3f47); }
        .field:focus-visible{
          outline: 2px solid color-mix(in srgb, var(--text, #e5e7eb) 24%, transparent);
          outline-offset: 2px;
        }

        .toggles{ display:flex; gap:8px; align-items:center; }
        .pill{
          height: 32px; padding: 0 10px; border-radius: 999px;
          border: 1px solid var(--border, #2a2f3a);
          background: var(--card, #111214); color: var(--foreground, #e5e7eb);
          font-size: 12px; letter-spacing: .2px;
          transition: background 140ms ease, border-color 140ms ease, color 140ms ease;
        }
        .pill.on{
          background: color-mix(in srgb, var(--text, #e5e7eb) 10%, transparent);
          border-color: color-mix(in srgb, var(--text, #e5e7eb) 22%, var(--border, #2a2f3a));
        }
        .pill:hover{ border-color: var(--ring, #3b3f47); }

        .icon{
          width: 32px; height: 32px; border-radius: 10px;
          display:grid; place-items:center;
          border: 1px solid var(--border, #2a2f3a);
          background: var(--card, #111214); color: var(--foreground, #e5e7eb);
          cursor: pointer;
          transition: border-color 140ms ease, background 140ms ease, transform 120ms ease;
        }
        .icon:hover{ border-color: var(--ring, #3b3f47); }
        .icon.spin{ animation: rot 760ms linear infinite; }
        @keyframes rot{ to { transform: rotate(360deg); } }

        .skl{
          display:inline-block;
          width: 64px; height: 12px; border-radius: 7px;
          background: color-mix(in srgb, var(--text, #0f172a) 12%, var(--surface, #f7f9fc));
          position: relative; top: 2px;
          overflow: hidden;
        }
        .skl::after{
          content:""; position:absolute; inset:0; transform:translateX(-100%);
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.45), transparent);
          animation: shimmer 1.15s ease-in-out infinite;
        }
        @keyframes shimmer{ 100% { transform: translateX(100%); } }

        @media (prefers-color-scheme: light){
          .field, .pill, .icon{
            border: 1px solid var(--border, #e5e7eb);
            background: #ffffff; color: #111827;
          }
          .pill.on{
            background: color-mix(in srgb, #111827 6%, #ffffff);
            border-color: #a3a3a3;
          }
        }

        .index-row{
          display:grid;
          grid-template-columns: minmax(0,1fr) auto;
          align-items:center;
          gap:var(--col-gap);
        }
        .index-row > *{ min-width:0; }
        .value{ font-weight:600; font-variant-numeric: tabular-nums; }
      `}</style>
    </section>
  );
}
