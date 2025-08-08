"use client";
import { useEffect, useMemo, useState } from "react";
import LegRow from "./LegRow";
import { fmtNum } from "../../utils/format";

export default function LegsSection({ currency = "EUR", onNetPremiumChange }) {
  const [legs, setLegs] = useState({
    lc: { enabled: false, strike: "", premium: "", qty: 1 },
    sc: { enabled: false, strike: "", premium: "", qty: 1 },
    lp: { enabled: false, strike: "", premium: "", qty: 1 },
    sp: { enabled: false, strike: "", premium: "", qty: 1 }
  });

  const setPart = (k, p) => setLegs(prev => ({ ...prev, [k]: { ...prev[k], ...p } }));

  const netPremium = useMemo(() => {
    const val = (leg, sign) => {
      if (!leg.enabled) return 0;
      const p = parseFloat(leg.premium), q = parseFloat(leg.qty);
      if (!isFinite(p) || !isFinite(q)) return 0;
      return sign * p * q; // buys + / sells -
    };
    return val(legs.lc, +1) + val(legs.lp, +1) + val(legs.sc, -1) + val(legs.sp, -1);
  }, [legs]);

  useEffect(() => { onNetPremiumChange?.(netPremium); }, [netPremium, onNetPremiumChange]);

  return (
    <section className="card">
      <h3>Legs</h3>
      <div className="grid" style={{ gap: 12 }}>
        <LegRow label="Long Call"  {...legs.lc} onEnabled={v => setPart("lc", { enabled: v })} onChange={p => setPart("lc", p)} />
        <LegRow label="Short Call" {...legs.sc} onEnabled={v => setPart("sc", { enabled: v })} onChange={p => setPart("sc", p)} />
        <LegRow label="Long Put"   {...legs.lp} onEnabled={v => setPart("lp", { enabled: v })} onChange={p => setPart("lp", p)} />
        <LegRow label="Short Put"  {...legs.sp} onEnabled={v => setPart("sp", { enabled: v })} onChange={p => setPart("sp", p)} />
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="small">Net Premium (buys + / sells −)</div>
        <div><strong>{fmtNum(netPremium)} {currency}</strong></div>
      </div>
    </section>
  );
}
