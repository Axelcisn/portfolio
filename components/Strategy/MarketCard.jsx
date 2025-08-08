"use client";
import { useEffect, useMemo, useState } from "react";
import { fmtPct } from "../../utils/format";

const INDICES = [
  { key: "SPX", label: "S&P 500" },
  { key: "STOXX", label: "STOXX 600" },
  { key: "NDX", label: "NASDAQ 100" }
];
const LOOKS = ["1y", "2y", "3y", "5y", "10y"];

/* % input helpers — allow dot, up to 2 decimals, keep raw while typing */
const pctPattern = /^(\d{0,3})(?:\.(\d{0,2})?)?$/; // "", "5", "5.", "5.5", "12.34", "100"
const sanitizePct = (raw) => raw.replace(/[^\d.]/g, ""); // no commas, no spaces
const canAccept = (raw) => raw === "" || pctPattern.test(raw);
const stripTrailingDot = (raw) => (raw.endsWith(".") ? raw.slice(0, -1) : raw);

export default function MarketCard({ onRates }) {
  // UI shows percent numbers (e.g., "5.50"), internal emits decimals (e.g., 0.055)
  const [riskFreePct, setRiskFreePct] = useState("");
  const [mrpPct, setMrpPct] = useState("");

  const [indexKey, setIndexKey] = useState("STOXX");
  const [lookback, setLookback] = useState("2y");
  const [indexAnn, setIndexAnn] = useState(null);

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

  // Initial fetch (populate % inputs from decimals; emit to parent)
  useEffect(() => {
    const fetchData = async () => {
      const r = await fetch(`/api/market?index=${indexKey}&lookback=${lookback}`);
      const d = await r.json();
      setRiskFreePct(d.riskFree != null ? (d.riskFree * 100).toFixed(2) : "");
      setMrpPct(d.mrp != null ? (d.mrp * 100).toFixed(2) : "");
      setIndexAnn(d.indexAnn ?? null);
      onRates?.({ riskFree: d.riskFree ?? 0, mrp: d.mrp ?? 0, indexAnn: d.indexAnn ?? null });
    };
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indexKey, lookback]);

  const commitRates = () => {
    onRates?.({
      riskFree: riskFreeDec ?? 0,
      mrp: mrpDec ?? 0,
      indexAnn
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
      </div>
    </section>
  );
}
