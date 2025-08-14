// components/Strategy/MarketCard.jsx
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { fmtPct } from "../../utils/format";

const INDICES = [
  { key: "SPX",   label: "S&P 500" },
  { key: "STOXX", label: "STOXX 600" },
  { key: "NDX",   label: "NASDAQ 100" }
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

export default function MarketCard({ onRates, currency = "USD", onBenchmarkChange }) {
  // UI stores percent strings; we emit decimals to parent
  const [riskFreePct, setRiskFreePct] = useState("");
  const [mrpPct, setMrpPct] = useState("");

  // Index avg return controls
  const [indexKey, setIndexKey] = useState("STOXX");
  const [lookback, setLookback] = useState("2y");
  const [indexAnn, setIndexAnn] = useState(null);

  // Benchmark linkage (default: same as index)
  const [sameBenchmark, setSameBenchmark] = useState(true);
  const [benchmarkKey, setBenchmarkKey] = useState("STOXX");
  const effectiveBenchmark = sameBenchmark ? indexKey : benchmarkKey;

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
      ...next
    });
  }

  async function fetchStats({ index = indexKey, lb = lookback, ccy = currency } = {}) {
    const qs = new URLSearchParams({
      index, lookback: lb, currency: ccy, basis: "annual"
    }).toString();

    abortRef.current?.abort?.();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoadingStats(true);
    setLoadingIndex(true);
    try {
      const r = await fetch(`/api/market/stats?${qs}`, { cache: "no-store", signal: ac.signal });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || `Market ${r.status}`);

      if (autoRF && typeof d?.riskFree?.r === "number") {
        setRiskFreePct((d.riskFree.r * 100).toFixed(2));
      }
      if (autoMRP && typeof d?.mrp === "number") {
        setMrpPct((d.mrp * 100).toFixed(2));
      }
      setIndexAnn(typeof d?.indexAnn === "number" ? d.indexAnn : null);

      emitRates({
        riskFree: autoRF ? d?.riskFree?.r ?? riskFreeDec ?? 0 : riskFreeDec ?? 0,
        mrp:      autoMRP ? d?.mrp ?? mrpDec ?? 0 : mrpDec ?? 0,
        indexAnn: d?.indexAnn ?? null
      });
    } catch {
      /* keep previous values */
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

  // Re-fetch when index/lookback/auto flags change (debounced)
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchStats(), 250);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indexKey, lookback, currency, autoRF, autoMRP]);

  // Emit effective benchmark to parent
  useEffect(() => {
    onBenchmarkChange?.(effectiveBenchmark);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveBenchmark]);

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

        {/* Row 3 — Index Average Return */}
        <div className="vgroup">
          <label>Index Average Return</label>
          <div className="index-row">
            <div className="row">
              <select
                className="field"
                value={indexKey}
                onChange={(e) => setIndexKey(e.target.value)}
                style={{ width: 200 }}
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

          {/* Helper line for benchmark linkage */}
          <div className="helper">
            <span className="muted">
              Also used as β benchmark
              {sameBenchmark ? "" : " (overridden)"}
              .
            </span>
            <button
              className="ghost"
              onClick={() => setSameBenchmark((s) => !s)}
              aria-expanded={!sameBenchmark}
            >
              {sameBenchmark ? "Change" : "Use index"}
            </button>
          </div>
        </div>

        {/* Optional — separate Benchmark only when user chooses to override */}
        {!sameBenchmark && (
          <div className="vgroup">
            <label>Benchmark (β)</label>
            <select
              className="field"
              value={benchmarkKey}
              onChange={(e) => setBenchmarkKey(e.target.value)}
            >
              {INDICES.map((i) => (
                <option key={i.key} value={i.key}>{i.label} ({i.key})</option>
              ))}
            </select>
          </div>
        )}
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

        /* Auto + Refresh controls */
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

        /* Index value skeleton */
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

        .helper{
          display:flex; align-items:center; justify-content:space-between;
          margin-top:4px;
        }
        .muted{ opacity:.65; font-size:12.5px; }
        .ghost{
          height: 28px; padding: 0 10px; border-radius: 8px;
          border: 1px solid transparent; background: transparent; color: inherit;
          opacity:.85; cursor:pointer;
          transition: background 140ms ease, border-color 140ms ease, opacity 120ms ease;
        }
        .ghost:hover{
          opacity:1;
          background: color-mix(in srgb, var(--text, #e5e7eb) 10%, transparent);
          border-color: color-mix(in srgb, var(--text, #e5e7eb) 14%, transparent);
        }

        @media (prefers-color-scheme: light){
          .field, .pill, .icon{ border: 1px solid var(--border, #e5e7eb); background: #fff; color: #111827; }
          .pill.on{ background: color-mix(in srgb, #111827 6%, #ffffff); border-color: #a3a3a3; }
        }
      `}</style>
    </section>
  );
}
