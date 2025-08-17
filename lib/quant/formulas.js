// lib/quant/formulas.js
// Canonical, single source of truth for ALL pricing/metrics math.
//
// USAGE (consumers; keep list updated as you migrate):
// - components/Options/ChainTable.jsx
// - components/Strategy/StrategyModal.jsx
// - components/Strategy/Chart.jsx (if present)
//
// Import style (recommended via barrel):
//   import { breakEven, probOfProfit, expectedPayoff, expectedProfit,
//            expectedGain, expectedLoss, variancePayoff, stdevPayoff,
//            sharpe, tenorFromDays, driftFromMode,
//            payoffAtExpiry, computeLegMetrics, aggregateStrategyMetrics
//          } from "lib/quant";
//
// Notes:
// - Units: S0/K/premium in currency; sigma, rates, drift as annual decimals; T in years.
// - Measure: risk-neutral μ = r - q, or physical/CAPM μ = muCapm.
// - We ignore explicit financing/discounting of premiums in expectations shown to users.

const EPS = 1e-12;

/** Type guards */
function _num(x) { return Number.isFinite(x); }
function _pos(x) { return _num(x) && x > 0; }

/* ------------------------ Standard normal utilities ------------------------ */

/** Error function approximation (Abramowitz-Stegun) */
export function erf(x) {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741,
        a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-x * x);
  return sign * y;
}

/** Standard normal CDF */
export function Phi(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/* ------------------------ Lognormal helpers & d's ------------------------- */

/** v = sigma * sqrt(T) */
export function volSqrtT(sigma, T) {
  return _pos(sigma) && _pos(T) ? sigma * Math.sqrt(T) : null;
}

/** d1(S0,K,mu,sigma,T) */
export function d1(S0, K, mu, sigma, T) {
  const v = volSqrtT(sigma, T);
  if (!(_pos(S0) && _pos(K) && v)) return null;
  return (Math.log(S0 / K) + (mu + 0.5 * sigma * sigma) * T) / v;
}

/** d2 = d1 - v */
export function d2(S0, K, mu, sigma, T) {
  const d = d1(S0, K, mu, sigma, T), v = volSqrtT(sigma, T);
  return _num(d) && v != null ? d - v : null;
}

/** dbar uses (mu - 0.5*sigma^2) in numerator */
export function dbar(S0, K, mu, sigma, T) {
  const v = volSqrtT(sigma, T);
  if (!(_pos(S0) && _pos(K) && v)) return null;
  return (Math.log(S0 / K) + (mu - 0.5 * sigma * sigma) * T) / v;
}

/* ------------------------------- Tenor & μ ------------------------------- */

/** Convert days/basis to years T */
export function tenorFromDays(days, basis = 365) {
  if (!_pos(basis)) return null;
  const d = Math.max(1, Math.floor(Number(days) || 0));
  return d / basis;
}

/** Select drift μ by mode */
export function driftFromMode({ mode = "RN", rf = 0, q = 0, muCapm = 0 } = {}) {
  return mode === "CAPM" ? Number(muCapm) || 0 : (Number(rf) || 0) - (Number(q) || 0);
}

/* ------------------------------- Break-even ------------------------------- */

export function breakEven({ type, K, premium }) {
  const k = Number(K), p = Number(premium);
  if (!_pos(k) || !(_num(p) && p >= 0)) return null;
  if (type === "call") return k + p;
  if (type === "put") return Math.max(1e-9, k - p);
  return null;
}

/* ---------------------------- Expected payoff ----------------------------- */

/**
 * Expected option payoff (not P&L).
 * Call: E[(S_T-K)^+] = S0*e^{mu T}*Phi(d1) - K*Phi(d2)
 * Put : E[(K-S_T)^+] = K*Phi(-d2) - S0*e^{mu T}*Phi(-d1)
 */
export function expectedPayoff({ type, S0, K, sigma, T, drift: mu }) {
  const s0 = Number(S0), k = Number(K), sig = Number(sigma), t = Number(T), m = Number(mu);
  if (!(_pos(s0) && _pos(k) && _pos(sig) && _pos(t))) return null;
  const d_1 = d1(s0, k, m, sig, t), d_2 = d2(s0, k, m, sig, t);
  if (!(_num(d_1) && _num(d_2))) return null;
  const expST = Math.exp(m * t);
  if (type === "call") return s0 * expST * Phi(d_1) - k * Phi(d_2);
  if (type === "put")  return k * Phi(-d_2) - s0 * expST * Phi(-d_1);
  return null;
}

/* --------------------------- Expected profit E[X] -------------------------- */

export function expectedProfit({ type, pos, premium, S0, K, sigma, T, drift }) {
  const epay = expectedPayoff({ type, S0, K, sigma, T, drift });
  const p = Number(premium);
  if (!_num(epay) || !(_num(p) && p >= 0)) return null;
  if (pos === "long") return epay - p;
  if (pos === "short") return p - epay;
  return null;
}

/* ----------------------- E[X^+] (EP) and E[X^-] (EL) ---------------------- */

/**
 * Expected positive P&L (E[X^+]) for LONG positions via closed-form thresholds.
 * For short positions, use sign symmetry: X_short = -X_long.
 */
function _expectedPositivePnL_Long({ type, S0, K, premium, sigma, T, drift: mu }) {
  const s0 = Number(S0), k = Number(K), p = Number(premium), sig = Number(sigma), t = Number(T), m = Number(mu);
  if (!(_pos(s0) && _pos(k) && _num(p) && p >= 0 && _pos(sig) && _pos(t))) return null;
  const v = volSqrtT(sig, t);
  if (!v) return null;
  const expST = Math.exp(m * t);

  if (type === "call") {
    const a = k + p;                         // profit if S_T > a
    const d1a = (Math.log(s0 / a) + (m + 0.5 * sig * sig) * t) / v;
    const dba = (Math.log(s0 / a) + (m - 0.5 * sig * sig) * t) / v;
    return s0 * expST * Phi(d1a) - a * Phi(dba);
  }

  if (type === "put") {
    const a = k - p;                         // profit if S_T < a
    if (!(a > 0)) return 0;                  // degenerate: threshold below 0
    const d1a = (Math.log(s0 / a) + (m + 0.5 * sig * sig) * t) / v;
    const dba = (Math.log(s0 / a) + (m - 0.5 * sig * sig) * t) / v;
    return a * Phi(-dba) - s0 * expST * Phi(-d1a);
  }

  return null;
}

/** Expected Gain EP = E[X^+] (reported >= 0) */
export function expectedGain({ type, pos, S0, K, premium, sigma, T, drift }) {
  if (pos === "long") return _expectedPositivePnL_Long({ type, S0, K, premium, sigma, T, drift });
  if (pos === "short") {
    // EP_short = E[(-X_long)^+] = E[X_long^-] = EL_long
    const el_long = expectedLoss({ type, pos: "long", S0, K, premium, sigma, T, drift });
    return _num(el_long) ? el_long : null;
  }
  return null;
}

/** Expected Loss EL = E[X^-] (reported positive) */
export function expectedLoss({ type, pos, S0, K, premium, sigma, T, drift }) {
  // Use identity EL = EP - E[X]
  const ep = pos === "long"
    ? _expectedPositivePnL_Long({ type, S0, K, premium, sigma, T, drift })
    : expectedGain({ type, pos: "short", S0, K, premium, sigma, T, drift }); // recursion resolves via long branch
  const ex = expectedProfit({ type, pos, premium, S0, K, sigma, T, drift });
  if (!(_num(ep) && _num(ex))) return null;
  return Math.max(0, ep - ex);
}

/* --------------------------- Variance / Stdev ----------------------------- */

/**
 * Variance of payoff (not P&L). Premium is a constant shift → same variance.
 * Uses truncated lognormal moments.
 */
export function variancePayoff({ type, S0, K, sigma, T, drift: mu }) {
  const s0 = Number(S0), k = Number(K), sig = Number(sigma), t = Number(T), m = Number(mu);
  if (!(_pos(s0) && _pos(k) && _pos(sig) && _pos(t))) return null;

  const v = volSqrtT(sig, t);
  const d_1 = d1(s0, k, m, sig, t);
  const db  = dbar(s0, k, m, sig, t);
  if (!(_num(v) && _num(d_1) && _num(db))) return null;

  const expST  = Math.exp(m * t);
  const expS2T = Math.exp(2 * m * t + sig * sig * t);
  const S1_above = s0 * expST * Phi(d_1);
  const S2_above = s0 * s0 * expS2T * Phi(d_1 + v);
  const PgtK     = Phi(db);

  const S1_below = s0 * expST * Phi(-d_1);
  const S2_below = s0 * s0 * expS2T * Phi(-(d_1 + v));
  const PltK     = Phi(-db);

  let Epay, E2pay;
  if (type === "call") {
    Epay  = s0 * expST * Phi(d_1) - k * Phi(d_1 - v);
    E2pay = S2_above - 2 * k * S1_above + k * k * PgtK;
  } else if (type === "put") {
    Epay  = k * Phi(v - d_1) - s0 * expST * Phi(-d_1);
    E2pay = k * k * PltK - 2 * k * S1_below + S2_below;
  } else {
    return null;
  }

  const variance = Math.max(0, E2pay - Epay * Epay);
  return variance;
}

export function stdevPayoff(args) {
  const v = variancePayoff(args);
  return _num(v) ? Math.sqrt(v) : null;
}

/* --------------------------------- Sharpe --------------------------------- */

export function sharpe({ expProfit, stdev }) {
  if (!(_num(expProfit) && _num(stdev) && stdev > 0)) return null;
  return expProfit / stdev;
}

/* ------------------------------ Payoff helper ----------------------------- */

/** Deterministic payoff at expiry given terminal price S (for charts) */
export function payoffAtExpiry({ type, pos, S, K, premium }) {
  const s = Number(S), k = Number(K), p = Number(premium) || 0;
  if (!(_pos(s) && _pos(k))) return null;
  const intr = type === "call" ? Math.max(s - k, 0) : Math.max(k - s, 0);
  const longPnL = intr - p;
  return pos === "long" ? longPnL : -longPnL;
}

/* ---------------------------- Strategy aggregator ------------------------- */

/**
 * Compute per-leg metrics. Accepts either:
 *  - { type: 'call'|'put', pos: 'long'|'short', K, premium, qty, days? }
 *  - { type: 'lc'|'sc'|'lp'|'sp', K, premium, qty, days? }  // convenience
 *
 * ctx: { S0, sigma, T?, days?, basis?, driftMode?, rf?, q?, muCapm?, contractMultiplier? }
 */
export function computeLegMetrics(leg, ctx = {}) {
  const map = { lc: ["call", "long"], sc: ["call", "short"], lp: ["put", "long"], sp: ["put", "short"] };
  const tuple = map[leg?.type] || [leg?.type, leg?.pos];
  const type = tuple[0], pos = tuple[1];

  const S0 = Number(ctx.S0);
  const K = Number(leg.K);
  const premium = Number(leg.premium || 0);
  const qty = Math.abs(Number(leg.qty || 0));
  const basis = Number(ctx.basis || 365);
  const sigma = Number(ctx.sigma);
  const drift = driftFromMode({
    mode: ctx.driftMode || "RN",
    rf: ctx.rf || 0,
    q: ctx.q || 0,
    muCapm: ctx.muCapm || 0,
  });

  // Tenor preference: leg.days → ctx.days → ctx.T
  let T = _pos(leg.days) ? tenorFromDays(leg.days, basis)
       : _pos(ctx.days)  ? tenorFromDays(ctx.days, basis)
       : _pos(ctx.T)     ? Number(ctx.T)
       : null;

  const stdev = stdevPayoff({ type, S0, K, sigma, T, drift });
  const ex = expectedProfit({ type, pos, premium, S0, K, sigma, T, drift });
  const ep = expectedGain({ type, pos, S0, K, premium, sigma, T, drift });
  const el = expectedLoss({ type, pos, S0, K, premium, sigma, T, drift });
  const er = _num(ex) && premium > 0 ? ex / Math.max(EPS, premium) : null;
  const be = breakEven({ type, K, premium });
  const pop = probOfProfit({ type, pos, S0, K, premium, sigma, T, drift });

  const metrics = { type, pos, K, premium, qty, T, be, pop, expProfit: ex, expReturn: er, ep, el, stdev, sharpe: sharpe({ expProfit: ex, stdev }) };

  // Scaling
  const scale = Math.abs(qty) * Math.max(1, Number(ctx.contractMultiplier || 1));
  const scaled = Object.fromEntries(Object.entries(metrics).map(([k, v]) => (["be","pop","type","pos","K","premium","qty","T"].includes(k) ? [k, v] : [k, _num(v) ? v * scale : v])));

  return { raw: metrics, scaled };
}

/** Aggregate an array of legs into strategy totals (scaled) */
export function aggregateStrategyMetrics(legs = [], ctx = {}) {
  const totals = { expProfit: 0, expReturn: 0, ep: 0, el: 0, stdev: 0, sharpe: null, pop: null }; // pop aggregated per-leg doesn't strictly compose; report null unless you define weighting.
  let sumVar = 0, sumPrem = 0, sumReturnWeight = 0;

  const details = legs.map((leg) => {
    const res = computeLegMetrics(leg, ctx);
    if (res?.scaled) {
      const s = res.scaled;
      if (_num(s.expProfit)) totals.expProfit += s.expProfit;
      if (_num(s.ep)) totals.ep += s.ep;
      if (_num(s.el)) totals.el += s.el;
      if (_num(s.stdev)) sumVar += s.stdev * s.stdev;
      if (_num(s.expReturn) && _num(leg.premium) && leg.premium > 0) {
        // Weight returns by premium spend to get a reasonable combined number
        totals.expReturn += s.expReturn * (leg.premium * Math.abs(leg.qty || 0));
        sumReturnWeight += (leg.premium * Math.abs(leg.qty || 0));
      }
      if (_num(leg.premium)) sumPrem += leg.premium * Math.abs(leg.qty || 0);
    }
    return res;
  });

  totals.stdev = sumVar > 0 ? Math.sqrt(sumVar) : null;
  totals.sharpe = _num(totals.expProfit) && _num(totals.stdev) && totals.stdev > 0 ? totals.expProfit / totals.stdev : null;
  totals.expReturn = sumReturnWeight > 0 ? totals.expReturn / sumReturnWeight : null;

  return { totals, legs: details };
}

/* ----------------------------- Probability of Profit ----------------------------- */

/**
 * PoP relative to BE threshold:
 *  - long call / short put: P(S_T >= BE)
 *  - short call / long put: P(S_T <= BE)
 */
export function probOfProfit({ type, pos, S0, K, premium, sigma, T, drift }) {
  const s0 = Number(S0), k = Number(K), p = Number(premium), sig = Number(sigma), t = Number(T), mu = Number(drift);
  if (!(_pos(s0) && _pos(k) && _num(p) && p >= 0 && _pos(sig) && _pos(t))) return null;
  const a = breakEven({ type, K: k, premium: p });
  const v = volSqrtT(sig, t);
  if (!(a && v)) return null;
  const z = (Math.log(a / s0) - (mu - 0.5 * sig * sig) * t) / v;
  const pLE = Phi(z);            // P(S_T <= a)
  const pGE = 1 - pLE;           // P(S_T >= a)
  const needsAbove = (type === "call" && pos === "long") || (type === "put" && pos === "short");
  return needsAbove ? pGE : pLE;
}

export default {
  erf, Phi,
  volSqrtT, d1, d2, dbar,
  tenorFromDays, driftFromMode,
  breakEven, expectedPayoff, expectedProfit,
  expectedGain, expectedLoss,
  variancePayoff, stdevPayoff,
  sharpe, payoffAtExpiry,
  computeLegMetrics, aggregateStrategyMetrics,
  probOfProfit,
};
