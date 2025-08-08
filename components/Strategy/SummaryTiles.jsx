"use client";
import { fmtCur, fmtPct } from "../../utils/format";

export default function SummaryTiles({ currency = "EUR", netPremium = 0, probProfit = null, expectancy = null, expReturn = null }) {
  return (
    <section className="card">
      <h3>Summary</h3>
      <div className="grid grid-3">
        <div className="card">
          <div className="small">Net Premium</div>
          <div><strong>{fmtCur(netPremium, currency)}</strong></div>
        </div>
        <div className="card">
          <div className="small">Probability of Profit</div>
          <div style={{ height: 10, background: "var(--border)", borderRadius: 6, overflow: "hidden", marginTop: 8 }}>
            <div style={{ width: `${(probProfit ?? 0) * 100}%`, height: "100%", background: "var(--accent)" }} />
          </div>
          <div className="small" style={{ marginTop: 6 }}>{probProfit == null ? "—" : fmtPct(probProfit)}</div>
        </div>
        <div className="card">
          <div className="small">Expectancy</div>
          <div><strong>{expectancy == null ? "—" : fmtCur(expectancy, currency)}</strong></div>
          <div className="small">{expReturn == null ? "" : `(${fmtPct(expReturn)} expected return)`}</div>
        </div>
      </div>
    </section>
  );
}
