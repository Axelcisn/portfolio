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
  const [indexKey, setIndexKey] = useState("SPX");
  const [lookback, setLookback] = useState("3y");
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
      <div className="grid grid-3">
        <div className="card">
          <div className="small">Risk-Free Rate</div>
          <input className="btn" value={riskFree} onChange={e => setRiskFree(e.target.value)} />
          <div className="small">decimal (0.027 = 2.7%)</div>
        </div>
        <div className="card">
          <div className="small">Market Risk Premium</div>
          <input className="btn" value={mrp} onChange={e => setMrp(e.target.value)} />
          <div className="small">decimal</div>
        </div>
        <div className="card">
          <div className="small">Index Average Return</div>
          <div className="small" style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <select className="btn" value={indexKey} onChange={e => setIndexKey(e.target.value)}>
              {INDICES.map(i => <option key={i.key} value={i.key}>{i.label}</option>)}
            </select>
            <select className="btn" value={lookback} onChange={e => setLookback(e.target.value)}>
              {LOOKS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div><strong>{indexAnn == null ? "—" : fmtPct(indexAnn)}</strong></div>
        </div>
      </div>
    </section>
  );
}
