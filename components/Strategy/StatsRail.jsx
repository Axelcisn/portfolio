"use client";
import { fmtCur, fmtPct, fmtNum } from "../../utils/format";

export default function StatsRail({
  spot = null,
  currency = "EUR",
  company = null,          // { beta, high52, low52, currency }
  iv = null,               // annualized decimal
  market = {},             // { riskFree, mrp, indexAnn }
  mcStats = null,          // { q05ST,q25ST,q50ST,q75ST,q95ST,qLoST,qHiST,meanST }
  probProfit = null,
  expectancy = null,
  expReturn = null,
}) {
  const rf = market?.riskFree ?? null;
  const mrp = market?.mrp ?? null;
  const idx = market?.indexAnn ?? null;

  const dist = [
    ["P5", mcStats?.q05ST],
    ["P25", mcStats?.q25ST],
    ["P50", mcStats?.q50ST],
    ["P75", mcStats?.q75ST],
    ["P95", mcStats?.q95ST],
    ["Lower Bound", mcStats?.qLoST],
    ["Upper Bound", mcStats?.qHiST],
    ["E[S]", mcStats?.meanST],
  ];

  const keyStats = [
    ["Spot", spot != null ? fmtCur(spot, currency) : "—"],
    ["IV (ann.)", iv != null ? fmtPct(iv) : "—"],
    ["Beta", company?.beta != null ? fmtNum(company.beta, 2) : "—"],
    ["52W High", company?.high52 != null ? fmtCur(company.high52, company?.currency || currency) : "—"],
    ["52W Low", company?.low52 != null ? fmtCur(company.low52, company?.currency || currency) : "—"],
    ["Risk-free", rf != null ? fmtPct(rf) : "—"],
    ["Index μ", idx != null ? fmtPct(idx) : "—"],
    ["MRP", mrp != null ? fmtPct(mrp) : "—"],
  ];

  return (
    <aside className="stats-rail">
      <section className="card dense">
        <div className="section-title">Strategy</div>
        <div className="dense-grid">
          <div className="card dense">
            <div className="small">Net Premium (EV)</div>
            <div className="strong">{expectancy == null ? "—" : fmtCur(expectancy, currency)}</div>
            <div className="small">{expReturn == null ? "" : `(${fmtPct(expReturn)} expected return)`}</div>
          </div>
          <div className="card dense">
            <div className="small">Probability of Profit</div>
            <div className="progress">
              <div className="bar" style={{ width: `${(probProfit ?? 0) * 100}%` }} />
            </div>
            <div className="small">{probProfit == null ? "—" : fmtPct(probProfit)}</div>
          </div>
        </div>
      </section>

      <section className="card dense">
        <div className="section-title">Distribution (S)</div>
        <div className="dense-grid" style={{ fontVariantNumeric: "tabular-nums" }}>
          {dist.map(([label, val]) => {
            if (!Number.isFinite(val) || !(spot > 0)) {
              return (
                <div key={label} className="tile">
                  <div className="small">{label}</div>
                  <div>—</div>
                </div>
              );
            }
            const pct = (val / spot) - 1;
            return (
              <div key={label} className="tile">
                <div className="small">{label}</div>
                <div className="strong">{fmtNum(val, 2)} <span className="muted">({fmtPct(pct)})</span></div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card dense">
        <div className="section-title">Key stats</div>
        <div className="kv">
          {keyStats.map(([k, v]) => (
            <div key={k} className="stat-row">
              <span className="k">{k}</span>
              <span className="v">{v}</span>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}
