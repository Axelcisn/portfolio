"use client";
import { useEffect, useMemo, useState } from "react";
import { fmtPct } from "../../utils/format";
import { getMarketStats } from "../../lib/client/market";
import BetaBenchmarkSelect from "./BetaBenchmarkSelect";

// Notes (LaTeX, reference):
// • \mathrm{ERP} = E(R_m) - r_f
// • \mu_{\text{geom}} = \bar{r}_\Delta \cdot 252
// • r_{\text{cont}} = \ln(1+r_{\text{annual}}),\; r_{\text{annual}} = e^{r_{\text{cont}}}-1

const INDICES = [
  { key: "SPX", label: "S&P 500" },
  { key: "STOXX", label: "STOXX 600" },
  { key: "NDX", label: "NASDAQ 100" }
];

const LOOKS = ["1y", "2y", "3y", "5y", "10y"];

// Minimal index→currency inference (overrideable via prop).
const currencyByIndexKey = (k) => (k === "STOXX" ? "EUR" : "USD");

// Default benchmark by index key (Yahoo symbols)
const defaultBenchmarkByIndexKey = {
  SPX: "^GSPC",
  STOXX: "^STOXX",
  NDX: "^NDX",
};

/**
 * MarketCard
 * Props:
 *  - onRates?: ({ riskFree, mrp, indexAnn }) => void
 *  - currency?: string (optional) — passed through to the API; otherwise inferred by index
 *  - onBenchmarkChange?: (symbol: string) => void
 */
export default function MarketCard({ onRates, currency, onBenchmarkChange }) {
  // Display-only percent strings for the two numeric fields
  const [riskFreePct, setRiskFreePct] = useState("—");
  const [mrpPct, setMrpPct] = useState("—");

  // Index selection + computed average return (decimal/year)
  const [indexKey, setIndexKey] = useState("STOXX");
  const [lookback, setLookback] = useState("2y");
  const [indexAnn, setIndexAnn] = useState(null); // decimal/year

  // Benchmark (β) — defaults with index; user may override
  const [benchmark, setBenchmark] = useState(defaultBenchmarkByIndexKey["STOXX"]);

  // Keep benchmark default aligned when index changes (user can re-override)
  useEffect(() => {
    const def = defaultBenchmarkByIndexKey[indexKey] || "^GSPC";
    setBenchmark(def);
  }, [indexKey]);

  // Notify parent of benchmark changes if asked
  useEffect(() => {
    onBenchmarkChange?.(benchmark);
  }, [benchmark, onBenchmarkChange]);

  // Fetch fresh values from the stats endpoint
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const ccy = (currency || currencyByIndexKey(indexKey)).toUpperCase();
        const data = await getMarketStats({
          index: indexKey,            // server normalizes alias (e.g., SPX → ^GSPC)
          lookback,                   // server supports 2y
          basis: "annual",
          currency: ccy
        });

        const rAnnual = data?.riskFree?.r;       // decimal/year
        const mrpAnnual = data?.mrp;             // decimal/year
        const muGeom = data?.stats?.mu_geom;     // decimal/year

        if (!alive) return;

        setRiskFreePct(
          typeof rAnnual === "number" && isFinite(rAnnual)
            ? (rAnnual * 100).toFixed(2)
            : "—"
        );
        setMrpPct(
          typeof mrpAnnual === "number" && isFinite(mrpAnnual)
            ? (mrpAnnual * 100).toFixed(2)
            : "—"
        );
        setIndexAnn(
          typeof muGeom === "number" && isFinite(muGeom) ? muGeom : null
        );

        onRates?.({
          riskFree: typeof rAnnual === "number" ? rAnnual : 0,
          mrp: typeof mrpAnnual === "number" ? mrpAnnual : 0,
          indexAnn: typeof muGeom === "number" ? muGeom : null
        });
      } catch {
        // Soft-fail: keep current display, still notify parent with safe zeros
        onRates?.({ riskFree: 0, mrp: 0, indexAnn: null });
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indexKey, lookback, currency]);

  // Tiny visual polish for the read-only inputs
  const roStyle = {
    cursor: "default",
    pointerEvents: "none",
    userSelect: "text",
    opacity: 1,
    transition: "box-shadow 140ms ease, transform 120ms ease",
  };

  return (
    <section className="card market">
      <h3>Market</h3>

      <div className="market-stack">
        {/* Row 1 — Risk-Free Rate (display-only) */}
        <div className="vgroup">
          <label>Risk-Free Rate</label>
          <input
            className="field"
            value={riskFreePct}
            readOnly
            aria-readonly="true"
            disabled
            style={roStyle}
          />
        </div>

        {/* Row 2 — Market Risk Premium (display-only) */}
        <div className="vgroup">
          <label>Market Risk Premium</label>
          <input
            className="field"
            value={mrpPct}
            readOnly
            aria-readonly="true"
            disabled
            style={roStyle}
          />
        </div>

        {/* Row 3 — Index Average Return (controls + value) */}
        <div className="vgroup">
          <label>Index Average Return</label>

          {/* Controls left; % value right */}
          <div className="index-row">
            <div className="row">
              <select
                className="field"
                value={indexKey}
                onChange={(e) => setIndexKey(e.target.value)}
                style={{ width: 200, transition: "border-color 140ms ease" }}
              >
                {INDICES.map((i) => (
                  <option key={i.key} value={i.key}>{i.label}</option>
                ))}
              </select>

              <select
                className="field"
                value={lookback}
                onChange={(e) => setLookback(e.target.value)}
                style={{ width: 120, transition: "border-color 140ms ease" }}
              >
                {LOOKS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>

            <div className="value" style={{ textAlign: "right" }}>
              {indexAnn == null ? "—" : fmtPct(indexAnn)}
            </div>
          </div>
        </div>

        {/* Row 4 — Benchmark (β) */}
        <div className="vgroup">
          <label>Benchmark (β)</label>
          <BetaBenchmarkSelect
            value={benchmark}
            onChange={(sym) => setBenchmark(sym)}
            showLabel={false}
          />
        </div>
      </div>
    </section>
  );
}
