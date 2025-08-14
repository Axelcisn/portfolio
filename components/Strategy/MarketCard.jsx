"use client";
import { useEffect, useMemo, useState } from "react";
import { fmtPct } from "../../utils/format";
import { getMarketStats } from "../../lib/client/market";
import BetaBenchmarkSelect from "./BetaBenchmarkSelect";

// Notes (LaTeX, reference):
// • Equity risk premium: \mathrm{ERP} = E(R_m) - r_f
// • Annualization (daily): \mu_{\text{geom}} = \bar{r}_\Delta \cdot 252,\quad \sigma = s_{r_\Delta}\sqrt{252}
// • Compounding: r_{\text{cont}} = \ln(1+r_{\text{annual}}),\quad r_{\text{annual}} = e^{r_{\text{cont}}}-1

const INDICES = [
  { key: "SPX", label: "S&P 500" },
  { key: "STOXX", label: "STOXX 600" },
  { key: "NDX", label: "NASDAQ 100" },
];

// Keep UI options unchanged; map "2y" → "3y" when calling the API.
const LOOKS = ["1y", "2y", "3y", "5y", "10y"];
const mapLookback = (lb) => (lb === "2y" ? "3y" : lb);

// Minimal index→currency inference (overrideable via prop).
const currencyByIndexKey = (k) => {
  if (k === "STOXX") return "EUR";
  return "USD"; // SPX, NDX default to USD
};

// Default benchmark by index key (Yahoo symbols)
const defaultBenchmarkByIndexKey = {
  SPX: "^GSPC",
  STOXX: "^STOXX",
  NDX: "^NDX",
};

/* % input helpers — allow dot, up to 2 decimals, keep raw while typing */
const pctPattern = /^(\d{0,3})(?:\.(\d{0,2})?)?$/; // "", "5", "5.", "5.5", "12.34", "100"
const sanitizePct = (raw) => raw.replace(/[^\d.]/g, ""); // no commas, no spaces
const canAccept = (raw) => raw === "" || pctPattern.test(raw);
const stripTrailingDot = (raw) => (raw.endsWith(".") ? raw.slice(0, -1) : raw);

/**
 * MarketCard
 * Props:
 *  - onRates?: ({ riskFree, mrp, indexAnn }) => void
 *  - currency?: string (optional) — passed through to the API; otherwise inferred by index
 *  - onBenchmarkChange?: (symbol: string) => void  — emits selected benchmark (Yahoo symbol)
 */
export default function MarketCard({ onRates, currency, onBenchmarkChange }) {
  // UI shows percent numbers (e.g., "5.50"), internal emits decimals (e.g., 0.055)
  const [riskFreePct, setRiskFreePct] = useState("");
  const [mrpPct, setMrpPct] = useState("");

  const [indexKey, setIndexKey] = useState("STOXX");
  const [lookback, setLookback] = useState("2y");
  const [indexAnn, setIndexAnn] = useState(null);

  // Benchmark (β) — defaults with index; user may override anytime
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

  const riskFreeDec = useMemo(() => {
    const v = stripTrailingDot(riskFreePct);
    const n = v === "" ? null : parseFloat(v);
    return n == null || !isFinite(n) ? null : n / 100;
  }, [riskFreePct]);

  const mrpDec = useMemo(() => {
    const v = stripTrailingDot(mrpPct);
    const n = v === "" ? null : parseFloat(v);
    return n == null || !isFinite(n) ? null : n / 100;
  }, [mrpPct]);

  // Initial + reactive fetch (populate % inputs; emit to parent)
  useEffect(() => {
    let alive = true;

    const fetchData = async () => {
      try {
        const ccy = (currency || currencyByIndexKey(indexKey)).toUpperCase();
        const data = await getMarketStats({
          index: indexKey,                 // server normalizes aliases (e.g., SPX → ^GSPC)
          lookback: mapLookback(lookback), // keep UI; map unsupported "2y" → "3y"
          basis: "annual",
          currency: ccy,
        });

        // riskFree in requested basis (annual), mrp computed on annual basis, indexAnn from μ_geom
        const rAnnual = data?.riskFree?.r;
        const mrpAnnual = data?.mrp;
        const muGeom = data?.stats?.mu_geom;

        if (!alive) return;

        setRiskFreePct(
          rAnnual != null && isFinite(rAnnual) ? (rAnnual * 100).toFixed(2) : ""
        );
        setMrpPct(
          mrpAnnual != null && isFinite(mrpAnnual) ? (mrpAnnual * 100).toFixed(2) : ""
        );
        setIndexAnn(muGeom != null && isFinite(muGeom) ? muGeom : null);

        onRates?.({
          riskFree: rAnnual ?? 0,
          mrp: mrpAnnual ?? 0,
          indexAnn: muGeom ?? null,
        });
      } catch {
        // Soft-fail: leave existing values; still notify parent with safe zeros so downstream remains stable.
        onRates?.({ riskFree: 0, mrp: 0, indexAnn: null });
      }
    };

    fetchData();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indexKey, lookback, currency]);

  const commitRates = () => {
    onRates?.({
      riskFree: riskFreeDec ?? 0,
      mrp: mrpDec ?? 0,
      indexAnn,
    });
  };

  return (
    <section className="card market">
      <h3>Market</h3>

      <div className="market-stack">
        {/* Row 1 — Risk-Free Rate */}
        <div className="vgroup">
          <label>Risk-Free Rate</label>
          <input
            className="field"
            inputMode="decimal"
            placeholder="e.g., 2.50"
            value={riskFreePct}
            onChange={(e) => {
              const raw = sanitizePct(e.target.value);
              if (canAccept(raw)) setRiskFreePct(raw);
            }}
            onBlur={() => {
              if (riskFreePct === "") return commitRates();
              const v = stripTrailingDot(riskFreePct);
              const n = parseFloat(v);
              setRiskFreePct(isFinite(n) ? n.toFixed(2) : "");
              commitRates();
            }}
          />
        </div>

        {/* Row 2 — Market Risk Premium */}
        <div className="vgroup">
          <label>Market Risk Premium</label>
          <input
            className="field"
            inputMode="decimal"
            placeholder="e.g., 5.50"
            value={mrpPct}
            onChange={(e) => {
              const raw = sanitizePct(e.target.value);
              if (canAccept(raw)) setMrpPct(raw);
            }}
            onBlur={() => {
              if (mrpPct === "") return commitRates();
              const v = stripTrailingDot(mrpPct);
              const n = parseFloat(v);
              setMrpPct(isFinite(n) ? n.toFixed(2) : "");
              commitRates();
            }}
          />
        </div>

        {/* Row 3 — Index Average Return */}
        <div className="vgroup">
          <label>Index Average Return</label>

          {/* Controls left; % value right (same row, centered vertically) */}
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

            <div className="value" style={{ textAlign: "right" }}>
              {indexAnn == null ? "—" : fmtPct(indexAnn)}
            </div>
          </div>
        </div>

        {/* Row 4 — Benchmark (β) override (tiny control, no layout change) */}
        <div className="vgroup">
          <label>Benchmark (β)</label>
          <BetaBenchmarkSelect
            value={benchmark}
            onChange={(sym) => setBenchmark(sym)}
          />
        </div>
      </div>
    </section>
  );
}
