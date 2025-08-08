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

  const fetchData = async () => {
    const r = await fetch(`/api/market?index=${indexKey}&lookback=${lookback}`);
    const d = await r.json();
    setRiskFree((d.riskFree ?? 0).toString());
    setMrp((d.mrp ?? 0).toString());
    setIndexAnn(d.indexAnn ?? null);
    onRates?.({ riskFree: d.riskFree, mrp: d.mrp, indexAnn: d.indexAnn });
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [indexKey, lookback]);

  return (
    <section className="card">
      <h3>Market</h3>

      {/* Row 1 — Risk-Free Rate */}
      <div className="row-split">
        <div>
          <div className="small">Risk-Free Rate</div>
          <input className="field" value={riskFree} onChange={e => setRiskFree(e.target.value)} />
          <div className="help">decimal (0.027 = 2.7%)</div>
        </div>
        <div /> {/* right side intentionally empty */}
      </div>

      {/* Row 2 — Market Risk Premium */}
      <div className="row-split">
        <div>
          <div className="small">Market Risk Premium</div>
          <input className="field" value={mrp} onChange={e => setMrp(e.target.value)} />
          <div className="help">decimal</div>
        </div>
        <div />
      </div>

      {/* Row 3 — Index Average Return */}
      <div className="row-split">
        {/* Left: label + value aligned */}
        <div>
          <div className="small">Index Average Return</div>
          <div className="value">{indexAnn == null ? "—" : fmtPct(indexAnn)}</div>
        </div>

        {/* Right: controls inline, right-justified */}
        <div className="row-right">
          <select className="field" value={indexKey} onChange={e => setIndexKey(e.target.value)} style={{ width: 160 }}>
            {INDICES.map(i => <option key={i.key} value={i.key}>{i.label}</option>)}
          </select>
          <select className="field" value={lookback} onChange={e => setLookback(e.target.value)} style={{ width: 100 }}>
            {LOOKS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
      </div>
    </section>
  );
}
