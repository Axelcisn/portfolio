// components/Strategy/StrategySpecs.jsx
"use client";

/**
 * Architecture / Specs panel shown under the chart.
 * Light calculations mirror the chart so values feel consistent.
 */
export default function StrategySpecs({ strategy, spot = 0, sigma = 0.3, T = 30 / 365, riskFree = 0 }) {
  const legs = strategy?.legs || {};

  const fmtN = (n) => (Number.isFinite(n) ? (Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(2)).replace(/\.00$/, "") : "—");

  const items = computeSpecs({ legs, spot, sigma, T, riskFree });

  return (
    <section className="card white-surface">
      <h3 style={{ marginTop: 0 }}>Architecture</h3>

      <div className="spec-grid">
        <Spec k="Composition" v={items.composition || "—"} />
        <Spec k="Breakeven(s)" v={items.breakeven || "—"} />
        <Spec k="Max Profit" v={items.maxProfit} />
        <Spec k="Max Loss" v={items.maxLoss} />
        <Spec k="Risk Profile" v={items.profile || "—"} />
        <Spec k="Greeks (Δ/Γ/Θ/ν)" v="— / — / — / —" />
      </div>

      <style jsx>{`
        .spec-grid{
          display:grid;
          gap:12px;
          grid-template-columns: repeat(3, minmax(0,1fr));
        }
        @media (max-width: 980px){
          .spec-grid{ grid-template-columns: 1fr; }
        }
      `}</style>
    </section>
  );

  function Spec({ k, v }) {
    return (
      <div className="spec card white-surface" style={{ padding: 12 }}>
        <div className="small" style={{ opacity: 0.75 }}>{k}</div>
        <div style={{ fontWeight: 600, marginTop: 6 }}>{v}</div>
      </div>
    );
  }

  function computeSpecs({ legs, spot, sigma, T, riskFree }) {
    const list = [];
    const add = (label, l) => {
      if (!l?.enabled) return;
      const qty = Number(l.qty ?? 0);
      const K = Number(l.K ?? l.strike);
      if (!Number.isFinite(K) || K <= 0 || !Number.isFinite(qty) || qty === 0) return;
      list.push({ label, K, qty, type: label.toLowerCase() });
    };
    add("Long Call", legs.lc);
    add("Short Call", legs.sc);
    add("Long Put", legs.lp);
    add("Short Put", legs.sp);

    // Composition string
    const comp = list
      .map((r) => `${r.qty > 0 ? r.qty + "× " : ""}${r.label} @ ${fmtN(r.K)}`)
      .join(" • ");

    // Simple expiry payoff to compute BE / max P&L / profile
    const xs = makeRange(list, spot);
    const exp = expiryPayoff(xs, list, riskFree, sigma, T);
    const breakevens = [];
    for (let i = 1; i < xs.length; i++) {
      const y0 = exp[i - 1], y1 = exp[i];
      if ((y0 <= 0 && y1 >= 0) || (y0 >= 0 && y1 <= 0)) {
        const t = y1 === y0 ? 0 : (0 - y0) / (y1 - y0);
        breakevens.push(xs[i - 1] + t * (xs[i] - xs[i - 1]));
      }
    }
    const beStr = breakevens.length ? breakevens.map((b) => fmtN(b)).join(" · ") : "—";
    const maxP = Math.max(...exp);
    const minP = Math.min(...exp);

    // crude slope check for direction
    const slopeRight = exp[exp.length - 1] - exp[exp.length - 2];
    const slopeLeft = exp[1] - exp[0];
    let profile = "Neutral";
    if (slopeRight > 2) profile = "Bullish";
    else if (slopeLeft < -2) profile = "Bearish";

    return {
      composition: comp,
      breakeven: beStr,
      maxProfit: formatMoney(maxP),
      maxLoss: formatMoney(minP),
      profile,
    };
  }

  function makeRange(list, spot) {
    const Ks = list.map((l) => l.K);
    const lo = Math.max(0.01, Math.min(spot, ...Ks, spot) * 0.65);
    const hi = Math.max(spot, ...Ks, spot) * 1.45;
    const N = 220;
    return Array.from({ length: N }, (_, i) => lo + (hi - lo) * (i / (N - 1)));
  }

  function expiryPayoff(xs, list /* no discounting at expiry */) {
    return xs.map((S) => {
      let val = 0;
      for (const l of list) {
        const sign = /Long/.test(l.label) ? 1 : -1;
        const call = /Call/.test(l.label);
        const intrinsic = Math.max(call ? S - l.K : l.K - S, 0);
        val += sign * intrinsic * l.qty;
      }
      return val;
    });
  }

  function formatMoney(n) {
    if (n === Infinity) return "∞";
    if (n === -Infinity) return "−∞";
    if (!Number.isFinite(n)) return "—";
    const a = Math.abs(n);
    const v = (a >= 100 ? n.toFixed(0) : a >= 10 ? n.toFixed(1) : n.toFixed(2)).replace(/\.00$/, "");
    return (n < 0 ? "−" : "") + "$" + v.replace(/^-/, "");
  }
}
