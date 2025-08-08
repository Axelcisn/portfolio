"use client";
import { useEffect, useState } from "react";
import { fmtPct } from "../../utils/format";

const INDICES = [
  { key: "SPX", label: "S&P 500" },
  { key: "STOXX", label: "STOXX 600" },
  { key: "NDX", label: "NASDAQ 100" }
];
const LOOKS = ["1y", "2y", "3y", "5y", "10y"];

export default function MarketCard({ onRates }) {
  const [riskFree, setRiskFree] = useState("");
  const [mrp, setMrp] = useState("");
  const [indexKey, setIndexKey] = useState("STOXX");
  const [lookback, setLookback] = useState("2y");
  const [indexAnn, setIndexAnn] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      const r = await fetch(`/api/market?index=${indexKey}&lookback=${lookback}`);
      const d = await r.json();
      setRiskFree((d.riskFree ?? 0).toString());
      setMrp((d.mrp ?? 0).toString());
      setIndexAnn(d.indexAnn ?? null);
      onRates?.({ riskFree: d.riskFree, mrp: d.mrp, indexAnn: d.indexAnn });
    };
    fetchData();
  }, [indexKey, lookback, onRates]);

  return (
    <section className="card market">
      <h3>Market</h3>

      <div className="market-stack">
        {/* Row 1 — Risk-Free Rate */}
        <div>
          <label>Risk-Free Rate</label>
          <input className="field" value={riskFree} onChange={e => setRiskFree(e.target.value)} />
        </div>

        {/* Row 2 — Market Risk Premium */}
        <div>
          <label>Market Risk Premium</label>
          <input className="field" value={mrp} onChange={e => setMrp(e.target.value)} />
        </div>

        {/* Row 3 — Index Average Return (3-line stack) */}
        <div>
          {/* Line 1: section title */}
          <label>Index Average Return</label>

          {/* Line 2: controls (right-aligned), each with sublabel */}
          <div className="row-right">
            <div className="col" style={{ width: 200 }}>
              <div className="sublabel">Index</div>
              <select className="field" value={indexKey} onChange={e => setIndexKey(e.target.value)}>
                {INDICES.map(i => <option key={i.key} value={i.key}>{i.label}</option>)}
              </select>
            </div>
            <div className="col" style={{ width: 120 }}>
              <div className="sublabel">Lookback</div>
              <select className="field" value={lookback} onChange={e => setLookback(e.target.value)}>
                {LOOKS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>

          {/* Line 3: result (aligned with section title) */}
          <div className="value">{indexAnn == null ? "—" : fmtPct(indexAnn)}</div>
        </div>
      </div>
    </section>
  );
}
