"use client";
import { useEffect, useMemo, useState } from "react";
import { fmtPct } from "../../utils/format";

const INDICES = [
  { key: "SPX", label: "S&P 500" },
  { key: "STOXX", label: "STOXX 600" },
  { key: "NDX", label: "NASDAQ 100" }
];
const LOOKS = ["1y", "2y", "3y", "5y", "10y"];

/* helpers: keep UX in % while we compute decimals */
const cleanPct = (s) => (s ?? "").toString().replace(/[^\d.,-]/g, "").replace(",", ".");
const toPctNumber = (s) => {
  const n = parseFloat(cleanPct(s));
  return isFinite(n) ? n : null;
};
const toPctDisplay = (s) => {
  const n = toPctNumber(s);
  return n == null ? "" : `${n}`;
};

export default function MarketCard({ onRates }) {
  // shown to user in %
  const [riskFreePct, setRiskFreePct] = useState("");
  const [mrpPct, setMrpPct] = useState("");

  const [indexKey, setIndexKey] = useState("STOXX");
  const [lookback, setLookback] = useState("2y");
  const [indexAnn, setIndexAnn] = useState(null);

  // decimals we emit upward
  const riskFreeDec = useMemo(() => {
    const n = toPctNumber(riskFreePct);
    return n == null ? null : n / 100;
  }, [riskFreePct]);
  const mrpDec = useMemo(() => {
    const n = toPctNumber(mrpPct);
    return n == null ? null : n / 100;
  }, [mrpPct]);

  // initial fetch
  useEffect(() => {
    const fetchData = async () => {
      const r = await fetch(`/api/market?index=${indexKey}&lookback=${lookback}`);
      const d = await r.json();
      // display as %
      setRiskFreePct(d.riskFree != null ? String((d.riskFree * 100).toFixed(2)) : "");
      setMrpPct(d.mrp != null ? String((d.mrp * 100).toFixed(2)) : "");
      setIndexAnn(d.indexAnn ?? null);
      onRates?.({ riskFree: d.riskFree, mrp: d.mrp, indexAnn: d.indexAnn });
    };
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indexKey, lookback]);

  // when user changes % and blurs, emit decimals up
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
        {/* Row 1 — Risk-Free Rate (label + extra spacing before input) */}
        <div className="vgroup">
          <label>Risk-Free Rate</label>
          <input
            className="field"
            inputMode="decimal"
            placeholder="e.g., 2.50"
            value={riskFreePct}
            onChange={(e) => setRiskFreePct(toPctDisplay(e.target.value))}
            onBlur={() => {
              const n = toPctNumber(riskFreePct);
              if (n != null) setRiskFreePct(String(n)); // keep "5.5" style; append "%" if you prefer -> `${n}%`
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
            onChange={(e) => setMrpPct(toPctDisplay(e.target.value))}
            onBlur={() => {
              const n = toPctNumber(mrpPct);
              if (n != null) setMrpPct(String(n));
              commitRates();
            }}
          />
        </div>

        {/* Row 3 — Index Average Return */}
        <div className="vgroup">
          {/* Line 1: title with extra spacing */}
          <label>Index Average Return</label>

          {/* Line 2: controls left, % result right — both vertically centered */}
          <div className="index-row">
            <div className="row">
              <div className="col" style={{ width: 200 }}>
                <div className="sublabel">Index</div>
                <select className="field" value={indexKey} onChange={(e) => setIndexKey(e.target.value)}>
                  {INDICES.map((i) => (
                    <option key={i.key} value={i.key}>{i.label}</option>
                  ))}
                </select>
              </div>
              <div className="col" style={{ width: 120 }}>
                <div className="sublabel">Lookback</div>
                <select className="field" value={lookback} onChange={(e) => setLookback(e.target.value)}>
                  {LOOKS.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>
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
