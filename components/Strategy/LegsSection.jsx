"use client";
import { useEffect, useMemo, useState } from "react";
import LegRow from "./LegRow";
import { fmtNum } from "../../lib/format";

const num = (v) => {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

export default function LegsSection({ currency = "EUR", onNetPremiumChange, onLegsChange }) {
  const [legs, setLegs] = useState({
    lc: { enabled: false, strike: "", premium: "", qty: 1 },
    sc: { enabled: false, strike: "", premium: "", qty: 1 },
    lp: { enabled: false, strike: "", premium: "", qty: 1 },
    sp: { enabled: false, strike: "", premium: "", qty: 1 },
  });

  const setPart = (k, p) => setLegs((prev) => ({ ...prev, [k]: { ...prev[k], ...p } }));

  // Net premium (buys + / sells −)
  const netPremium = useMemo(() => {
    const val = (leg, sign) =>
      leg.enabled ? (num(leg.premium) || 0) * ((+leg.qty || 0)) * sign : 0;
    return val(legs.lc, +1) + val(legs.lp, +1) + val(legs.sc, -1) + val(legs.sp, -1);
  }, [legs]);

  // Emit net premium whenever it changes
  useEffect(() => {
    onNetPremiumChange?.(netPremium);
  }, [netPremium, onNetPremiumChange]);

  // 🔴 Emit sanitized legs on ANY edit (strike, premium, qty, enabled)
  useEffect(() => {
    if (!onLegsChange) return;
    const map = (leg) => ({
      enabled: !!leg.enabled,
      K: num(leg.strike),
      premium: num(leg.premium),
      qty: Number.isFinite(+leg.qty) ? +leg.qty : 0,
    });
    onLegsChange({
      lc: map(legs.lc),
      sc: map(legs.sc),
      lp: map(legs.lp),
      sp: map(legs.sp),
    });
  }, [legs, onLegsChange]);

  return (
    <section>
      <div className="row">
        <h3>Legs</h3>
      </div>

      <div className="grid" style={{ gap: 12 }}>
        <LegRow label="Long Call"  {...legs.lc} onEnabled={(v) => setPart("lc", { enabled: v })} onChange={(p) => setPart("lc", p)} />
        <LegRow label="Short Call" {...legs.sc} onEnabled={(v) => setPart("sc", { enabled: v })} onChange={(p) => setPart("sc", p)} />
        <LegRow label="Long Put"   {...legs.lp} onEnabled={(v) => setPart("lp", { enabled: v })} onChange={(p) => setPart("lp", p)} />
        <LegRow label="Short Put"  {...legs.sp} onEnabled={(v) => setPart("sp", { enabled: v })} onChange={(p) => setPart("sp", p)} />
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="small">Net Premium (buys + / sells −)</div>
        <div><strong>{fmtNum(netPremium)} {currency}</strong></div>
      </div>
    </section>
  );
}
