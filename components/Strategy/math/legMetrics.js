// components/Strategy/math/legMetrics.js
// Closed-form expected positive/negative P&L for a single European option leg + simple strategy aggregator.
// NOTE: Uses lognormal (Black–Scholes) moments under drift `mu` (risk-neutral when mu = r - q).

const isNum = (x) => Number.isFinite(x);
const toNum = (x, d=0) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : d;
};

// Error function & Φ
function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  x = Math.abs(x);
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x));
  return sign * y;
}
const Phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));

/**
 * Per-leg metrics (EP, EL, PoP, E[Profit], E[Return], Sharpe, BE, sdPay)
 * @param {Object} p
 * @param {'call'|'put'} p.type
 * @param {'long'|'short'} p.dir
 * @param {number} p.S0  Spot
 * @param {number} p.K   Strike (>0)
 * @param {number} p.premium Option premium (>=0), price at t=0
 * @param {number} p.sigma Vol (annualized)
 * @param {number} p.T     Time in years (>0)
 * @param {number} p.mu    Drift (mu). Risk-neutral if mu = r - q.
 * @returns {{
 *  be:number|null, pop:number|null, ep:number|null, el:number|null,
 *  expP:number|null, expR:number|null, sharpe:number|null, sd:number|null
 * }}
 */
export function legMetrics({ type, dir, S0, K, premium, sigma, T, mu }) {
  const S = toNum(S0), k = toNum(K), prem = Math.max(0, toNum(premium)), v = toNum(sigma), Ty = toNum(T);
  const pos = dir === 'short' ? 'short' : 'long';

  if (!(S > 0) || !(k > 0) || !(v > 0) || !(Ty > 0)) {
    return { be: null, pop: null, ep: null, el: null, expP: null, expR: null, sharpe: null, sd: null };
  }

  const sigT = v * Math.sqrt(Ty);
  const expST = S * Math.exp((mu ?? 0) * Ty);

  const d1 = (a) => (Math.log(S / a) + ((mu ?? 0) + 0.5 * v * v) * Ty) / sigT;
  const dbar = (a) => (Math.log(S / a) + ((mu ?? 0) - 0.5 * v * v) * Ty) / sigT;

  const BE = type === 'call' ? k + prem : Math.max(1e-9, k - prem);
  const z = (Math.log(BE / S) - ((mu ?? 0) - 0.5 * v * v) * Ty) / sigT;
  const needsAbove = (type === 'call' && pos === 'long') || (type === 'put' && pos === 'short');
  const PoP = needsAbove ? (1 - Phi(z)) : Phi(z);

  let Epay;
  if (type === 'call') {
    const d1K = d1(k), dbK = dbar(k);
    Epay = expST * Phi(d1K) - k * Phi(dbK);
  } else {
    const d1K = d1(k), dbK = dbar(k);
    Epay = k * Phi(-dbK) - expST * Phi(-d1K);
  }

  // Positive part for LONG P&L: X = payoff - prem  (long). ep_long = E[(X)^+]
  let ep_long;
  if (type === 'call') {
    const a = k + prem;
    const d1a = d1(a), dba = dbar(a);
    ep_long = expST * Phi(d1a) - a * Phi(dba);
  } else {
    const a = k - prem;
    if (a <= 1e-12) ep_long = 0;
    else {
      const d1a = d1(a), dba = dbar(a);
      ep_long = a * Phi(-dba) - expST * Phi(-d1a);
    }
  }
  const expProfit_long = Epay - prem;
  const el_long = ep_long - expProfit_long; // E[X^-] = E[X^+] - E[X]

  let expProfit, ep, el;
  if (pos === 'long') {
    expProfit = expProfit_long;
    ep = ep_long;
    el = el_long;
  } else {
    expProfit = -expProfit_long;
    ep = el_long; // for short, positive part of P&L = E[X^-] from long
    el = ep_long; // expected loss for short = E[X^+] from long
  }

  // Var of payoff (not P&L) — premium is constant
  const S2exp = S * S * Math.exp(2 * (mu ?? 0) * Ty + v * v * Ty);
  let E2pay;
  if (type === 'call') {
    const d1K = d1(k), dbK = dbar(k);
    const E1_above = expST * Phi(d1K);
    const E2_above = S2exp * Phi(d1K + sigT);
    const PgtK = Phi(dbK);
    E2pay = E2_above - 2 * k * E1_above + k * k * PgtK;
  } else {
    const d1K = d1(k), dbK = dbar(k);
    const E1_below = expST * Phi(-d1K);
    const E2_below = S2exp * Phi(-(d1K + sigT));
    const PltK = Phi(-dbK);
    E2pay = k * k * PltK - 2 * k * E1_below + E2_below;
  }
  const varPay = Math.max(0, E2pay - Epay * Epay);
  const sdPay = Math.sqrt(varPay);

  const expReturn = prem > 0 ? (expProfit / prem) : null;
  const sharpe = sdPay > 0 ? (expProfit / sdPay) : null;

  return { be: BE, pop: PoP, ep, el, expP: expProfit, expR: expReturn, sharpe, sd: sdPay };
}

/**
 * Aggregate across legs (scaled by qty × multiplier)
 * @param {Array} legs rows with fields: { type:'call'|'put', dir:'long'|'short', K, premium, qty, days, multiplier }
 * @param {Object} env  { S0, sigma, mu, rf, q, basis }
 * @returns {{
 *   totalEP:number, totalEL:number, totalExpP:number, grossPremium:number, netPremium:number,
 *   expR:number|null, sharpe:number|null, pop:number|null
 * }}
 */
export function aggregateStrategy(legs = [], env = {}) {
  const S0 = toNum(env.S0), v = toNum(env.sigma), mu = toNum(env.mu, (toNum(env.rf)-toNum(env.q)));
  const basis = toNum(env.basis, 365);
  const rf = toNum(env.rf);

  let totalEP = 0, totalEL = 0, totalExpP = 0, grossPrem = 0, netPrem = 0;
  let sdQuad = 0; // √(sum sd_i^2) approximation (ignoring covariances)
  let any = false;

  for (const L of legs || []) {
    const mult = toNum(L.multiplier, 100);
    const qty = toNum(L.qty, 1);
    const prem = Math.max(0, toNum(L.premium, 0));
    const k = toNum(L.K || L.k, 0);
    const Ty = Math.max(0, toNum(L.days, env.days) / basis);

    const m = legMetrics({
      type: L.type === 'put' || L.type === 'p' ? 'put' : 'call',
      dir: L.dir === 'short' || L.type === 'sc' || L.type === 'sp' ? 'short' : 'long',
      S0, K: k, premium: prem, sigma: v, T: Ty, mu
    });

    const scale = qty * mult;
    if (isNum(m.ep)) totalEP += m.ep * scale;
    if (isNum(m.el)) totalEL += m.el * scale;
    if (isNum(m.expP)) totalExpP += m.expP * scale;
    if (isNum(m.sd)) sdQuad += (m.sd * scale) * (m.sd * scale);
    grossPrem += prem * scale;
    netPrem += (L.dir === 'short' || L.type === 'sc' || L.type === 'sp') ? +prem * scale : -prem * scale;
    any = true;
  }

  const expR = grossPrem > 0 ? (totalExpP / grossPrem) : null;
  const sdApprox = sdQuad > 0 ? Math.sqrt(sdQuad) : null;
  const sharpe = sdApprox && sdApprox > 0 ? (totalExpP / sdApprox) : null;

  // Probability of Profit for the whole strategy (approx): use analyticPop with a single T & sigma (from env)
  let pop = null;
  try {
    // Build legs for analyticPop (expects dir:'long'|'short', type, K, premium)
    const legsForPop = (legs || []).map(L => ({
      type: (L.type === 'put' || L.type === 'p' || L.type === 'lp' || L.type === 'sp') ? 'put' : 'call',
      dir: (L.dir === 'short' || L.type === 'sc' || L.type === 'sp') ? 'short' : 'long',
      K: toNum(L.K || L.k, 0),
      premium: Math.max(0, toNum(L.premium, 0)),
      qty: toNum(L.qty, 1),
      multiplier: toNum(L.multiplier, 100),
    }));
    // analyticPop collapses qty × multiplier by duplicating or scaling payout linearly;
    // For PoP, zero set is linear threshold, so scaling doesn't change the zero; we can ignore scale.
    const ap = require('./analyticPop.js');
    const analytic = ap && (ap.default || ap.analyticPop || ap);
    if (typeof analytic === 'function' && (S0 > 0) && (v >= 0)) {
      const res = analytic({ S: S0, sigma: v, T: Math.max(0, toNum(env.days)/basis), legs: legsForPop, mu, r: env.rf, q: env.q });
      if (res && isNum(res.pop)) pop = res.pop;
    }
  } catch {}

  return {
    totalEP, totalEL, totalExpP, grossPremium: grossPrem, netPremium: netPrem,
    expR, sharpe, pop
  };
}

/**
 * Under RN, EP - EL equals expected P&L which should be ≈ net premium carry to expiry.
 * Compute the carry (premium grown at rf to expiry minus initial premium).
 * @returns {number} carry
 */
export function netPremiumCarry(legs = [], env = {}) {
  const basis = toNum(env.basis, 365);
  const rf = toNum(env.rf, 0);
  let carry = 0;
  for (const L of legs || []) {
    const prem = Math.max(0, toNum(L.premium, 0));
    const qty = toNum(L.qty, 1);
    const mult = toNum(L.multiplier, 100);
    const sign = (L.dir === 'short' || L.type === 'sc' || L.type === 'sp') ? +1 : -1;
    const Ty = Math.max(0, toNum(L.days, env.days) / basis);
    carry += sign * prem * (Math.exp(rf * Ty) - 1) * qty * mult;
  }
  return carry;
}
