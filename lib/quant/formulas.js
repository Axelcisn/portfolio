// lib/quant/formulas.js
// Canonical, single source of truth for ALL pricing/metrics math.
// Sources: Bodie–Kane–Marcus (BSM, CAPM) and Passarelli (Greeks/behavior).
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
//            payoffAtExpiry, computeLegMetrics, aggregateStrategyMetrics,
//            bsCall, bsPut, callPrice, putPrice, normPdf, normCdf
//          } from "lib/quant/index.js";
//
// Notes:
// - Units: S0/K/premium in currency; sigma, rates, drift as annual decimals; T in years.
// - Measure: risk-neutral μ = r - q, or physical/CAPM μ = muCapm.
// - We ignore explicit financing/discounting of premiums in expectations shown to users.

const EPS = 1e-12;

/** Type guards */
function _num(x) { return Number.isFinite(x); }
function _pos(x) { return _num(x) && x > 0; }

/** ---------- Helpers to parse (μ,σ,T) vs (r,q,σ,T) signatures for d's ---------- */
function _parseDArgs(argsLike) {
  const a = Array.from(argsLike);
  // (S0, K, r, q, sigma, T)
  if (a.length >= 6) {
    const S0 = Number(a[0]), K = Number(a[1]);
    const r = Number(a[2]) || 0, q = Number(a[3]) || 0;
    const sigma = Number(a[4]), T = Number(a[5]);
    return { S0, K, mu: r - q, sigma, T };
  }
  // (S0, K, mu, sigma, T)
  const S0 = Number(a[0]), K = Number(a[1]);
  const mu = Number(a[2]), sigma = Number(a[3]), T = Number(a[4]);
  return { S0, K, mu, sigma, T };
}

/* ------------------------ Standard normal utilities ------------------------ */

/** Error function approximation (Abramowitz–Stegun) */
export function erf(x) {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741,
        a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t) * t) * Math.exp(-x * x);
  return sign * y;
}

/** Standard normal CDF */
export function Phi(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/** Standard normal PDF */
export function phi(z) {
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}

/** Aliases for tests/consumers */
export const normCdf = Phi;
export const normPdf = phi;

/* ------------------------ Lognormal helpers & d's ------------------------- */

/** v = sigma * sqrt(T) */
export function volSqrtT(sigma, T) {
  return _pos(sigma) && _pos(T) ? sigma * Math.sqrt(T) : null;
}

/** d1(S0,K,μ,σ,T)  OR  d1(S0,K,r,q,σ,T) with μ := r - q */
export function d1(/* S0, K, mu|r, sigma|q, T|sigma, [T] */) {
  const { S0, K, mu, sigma, T } = _parseDArgs(arguments);
  const v = volSqrtT(sigma, T);
  if (!(_pos(S0) && _pos(K) && v)) return null;
  return (Math.log(S0 / K) + (mu + 0.5 * sigma * sigma) * T) / v;
}

/** d2 = d1 - v (accepts both signatures like d1) */
export function d2(/* S0, K, mu|r, sigma|q, T|sigma, [T] */) {
  const { S0, K, mu, sigma, T } = _parseDArgs(arguments);
  const d = d1(S0, K, mu, sigma, T);
  const v = volSqrtT(sigma, T);
  return _num(d) && v != null ? d - v : null;
}

/** dbar uses (μ - 0.5σ^2) in numerator (accepts both signatures) */
export function dbar(/* S0, K, mu|r, sigma|q, T|sigma, [T] */) {
  const { S0, K, mu, sigma, T } = _parseDArgs(arguments);
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

/* --------------------------- Black–Scholes–Merton ------------------------- */

/** BSM call with carry q and discount r (object form) */
export function bsCall({ S0, K, T, sigma, r = 0, q = 0 } = {}) {
  const s0 = Number(S0), k = Number(K), t = Number(T), sig = Number(sigma);
  const rr = Number(r) || 0, qq = Number(q) || 0;
  if (!(_pos(s0) && _pos(k) && _pos(sig) && _pos(t))) return null;
  const d_1 = d1(s0, k, rr, qq, sig, t);
  const d_2 = d2(s0, k, rr, qq, sig, t);
  const dfS = Math.exp(-qq * t), dfK = Math.exp(-rr * t);
  return s0 * dfS * Phi(d_1) - k * dfK * Phi(d_2);
}

/** BSM put with carry q and discount r (object form) */
export function bsPut({ S0, K, T, sigma, r = 0, q = 0 } = {}) {
  const s0 = Number(S0), k = Number(K), t = Number(T), sig = Number(sigma);
  const rr = Number(r) || 0, qq = Number(q) || 0;
  if (!(_pos(s0) && _pos(k) && _pos(sig) && _pos(t))) return null;
  const d_1 = d1(s0, k, rr, qq, sig, t);
  const d_2 = d2(s0, k, rr, qq, sig, t);
  const dfS = Math.exp(-qq * t), dfK = Math.exp(-rr * t);
  return k * dfK * Phi(-d_2) - s0 * dfS * Phi(-d_1);
}

/** Aliases with positional OR object parameters for compatibility */
function _bsAlias(type, ...args) {
  if (args.length === 1 && typeof args[0] === "object") {
    return type === "call" ? bsCall(args[0]) : bsPut(args[0]);
  }
  const [S0, K, T, sigma, r = 0, q = 0] = args;
  return type === "call"
    ? bsCall({ S0, K, T, sigma, r, q })
    : bsPut({ S0, K, T, sigma, r, q });
}
export function callPrice(...args) { return _bsAlias("call", ...args); }
export function putPrice(...args)  { return _bsAlias("put",  ...args); }

/* ---------------------------- Expected payoff ----------------------------- */

/**
 * Expected option payoff (not P&L).
 * Call: E[(S_T-K)^+] = S0*e^{μT}*Phi(d1) - K*Phi(d2)
 * Put : E[(K-S_T)^+] = K*Phi(-d2) - S0*e^{μT}*Phi(-d1)
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

/* =================== Lognormal CDF/PDF & price aliases (compat) ================== */

/** Parse lognormal args:
 *  - (x, S0, mu, sigma, T)
 *  - (x, S0, r, q, sigma, T)  → mu := r - q
 *  - ({ x, S0, T, sigma, mu? , r?, q? })
 */
function _parseLognArgs(argsLike) {
  const a = Array.from(argsLike);
  if (a.length === 1 && typeof a[0] === "object") {
    const { x, S0, T, sigma, mu, r = 0, q = 0 } = a[0] ?? {};
    return { x: Number(x), S0: Number(S0), T: Number(T), sigma: Number(sigma), mu: Number(mu ?? (r - q)) };
  }
  if (a.length >= 6) {
    const [x, S0, r, q, sigma, T] = a;
    return { x: Number(x), S0: Number(S0), T: Number(T), sigma: Number(sigma), mu: Number(r) - Number(q) };
  }
  const [x, S0, mu, sigma, T] = a;
  return { x: Number(x), S0: Number(S0), T: Number(T), sigma: Number(sigma), mu: Number(mu) };
}

/** Lognormal CDF for S_T at threshold x under GBM(S0, mu, sigma, T). */
export function lognCdf(/* x,S0,mu|r, sigma|q, T|sigma, [T] OR {x,S0,T,sigma,mu|r,q} */) {
  const { x, S0, mu, sigma, T } = _parseLognArgs(arguments);
  if (!(_pos(x) && _pos(S0) && _pos(sigma) && _pos(T))) return null;
  const v = volSqrtT(sigma, T);
  const z = (Math.log(x / S0) - (mu - 0.5 * sigma * sigma) * T) / v;
  return Phi(z);
}

/** Lognormal PDF for S_T at x. */
export function lognPdf(/* same signatures as lognCdf */) {
  const { x, S0, mu, sigma, T } = _parseLognArgs(arguments);
  if (!(_pos(x) && _pos(S0) && _pos(sigma) && _pos(T))) return null;
  const v = volSqrtT(sigma, T);
  const y = Math.log(x / S0) - (mu - 0.5 * sigma * sigma) * T;
  return (1 / (x * v * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * (y / v) * (y / v));
}

/** Back-compat aliases used by some modules (positional legacy: S,K,r,q,sigma,T). */
export function bsCallPrice(...args) {
  if (args.length === 1 && typeof args[0] === "object") return callPrice(args[0]);
  if (args.length === 6) {
    const [S0, K, r, q, sigma, T] = args;
    return callPrice({ S0, K, T, sigma, r, q });
  }
  return callPrice(...args);
}
export function bsPutPrice(...args) {
  if (args.length === 1 && typeof args[0] === "object") return putPrice(args[0]);
  if (args.length === 6) {
    const [S0, K, r, q, sigma, T] = args;
    return putPrice({ S0, K, T, sigma, r, q });
  }
  return putPrice(...args);
}

/* =================== Hub Greeks + GBM helpers (compat) ==================== */

/** Parse BSM args:
 *  - positional: (S0, K, r, q, sigma, T)
 *  - object:     ({ S0, K, T, sigma, r=0, q=0 })
 */
function _parseBSArgs(argsLike) {
  const a = Array.from(argsLike);
  if (a.length === 1 && typeof a[0] === "object") {
    const { S0, K, T, sigma, r = 0, q = 0 } = a[0] ?? {};
    return { S0: Number(S0), K: Number(K), T: Number(T), sigma: Number(sigma), r: Number(r) || 0, q: Number(q) || 0 };
  }
  const [S0, K, r = 0, q = 0, sigma, T] = a;
  return { S0: Number(S0), K: Number(K), T: Number(T), sigma: Number(sigma), r: Number(r) || 0, q: Number(q) || 0 };
}

/** Core Greeks given sanitized inputs; vega per 1%, theta per day. */
function _greeksCore({ S0, K, T, sigma, r, q }, type /* 'call'|'put' */) {
  const tau = Math.max(Number(T) || 0, 1e-12);
  const vol = Math.max(Number(sigma) || 0, 1e-12);
  const discQ = Math.exp(-q * tau);
  const discR = Math.exp(-r * tau);

  const _d1 = d1(S0, K, r, q, vol, tau);
  const _d2 = _d1 - vol * Math.sqrt(tau);
  const nd1 = phi(_d1);

  if (type === "call") {
    const delta = discQ * Phi(_d1);
    const gamma = (discQ * nd1) / (S0 * vol * Math.sqrt(tau));
    const vegaPer1 = S0 * discQ * nd1 * Math.sqrt(tau);
    const vega = vegaPer1 / 100; // per 1% vol
    const thetaPerYear =
      (-S0 * discQ * nd1 * vol) / (2 * Math.sqrt(tau)) - r * K * discR * Phi(_d2) + q * S0 * discQ * Phi(_d1);
    const theta = thetaPerYear / 365; // per day
    const rho = K * tau * discR * Phi(_d2);
    return { delta, gamma, vega, theta, rho };
  } else {
    const delta = discQ * (Phi(_d1) - 1); // -discQ * N(-d1)
    const gamma = (discQ * nd1) / (S0 * vol * Math.sqrt(tau));
    const vegaPer1 = S0 * discQ * nd1 * Math.sqrt(tau);
    const vega = vegaPer1 / 100;
    const thetaPerYear =
      (-S0 * discQ * nd1 * vol) / (2 * Math.sqrt(tau)) +
      r * K * discR * (1 - Phi(_d2)) -
      q * S0 * discQ * (1 - Phi(_d1));
    const theta = thetaPerYear / 365;
    const rho = -K * tau * discR * (1 - Phi(_d2));
    return { delta, gamma, vega, theta, rho };
  }
}

/** Hub exports: Greeks (accept positional OR object). */
export function callGreeks(/* (S0,K,r,q,sigma,T) OR {S0,K,T,sigma,r,q} */) {
  const p = _parseBSArgs(arguments);
  return _greeksCore(p, "call");
}
export function putGreeks(/* (S0,K,r,q,sigma,T) OR {S0,K,T,sigma,r,q} */) {
  const p = _parseBSArgs(arguments);
  return _greeksCore(p, "put");
}
/** Back-compat alias names some modules expect */
export const greeksCall = callGreeks;
export const greeksPut  = putGreeks;

/** GBM helpers */
export function gbmMean(S0, mu = 0, T = 0) {
  return Number(S0) * Math.exp(Number(mu) * Number(T));
}
export function gbmCI95(S0, mu = 0, sigma = 0, T = 0) {
  const v = Number(sigma) * Math.sqrt(Math.max(0, Number(T)));
  const m = Math.log(Math.max(1e-12, Number(S0))) + (Number(mu) - 0.5 * Number(sigma) ** 2) * Number(T);
  const z975 = 1.959963984540054;
  const lo = Math.exp(m - z975 * v);
  const hi = Math.exp(m + z975 * v);
  return [lo, hi];
}

/* ------------------------------ Default export ---------------------------- */

const _default = {
  erf, Phi, phi, normCdf, normPdf,
  volSqrtT, d1, d2, dbar,
  tenorFromDays, driftFromMode,
  breakEven, expectedPayoff, expectedProfit,
  expectedGain, expectedLoss,
  variancePayoff, stdevPayoff,
  sharpe, payoffAtExpiry,
  computeLegMetrics, aggregateStrategyMetrics,
  probOfProfit,
  bsCall, bsPut, callPrice, putPrice,
  lognCdf, lognPdf, bsCallPrice, bsPutPrice,
  callGreeks, putGreeks, greeksCall, greeksPut,
  gbmMean, gbmCI95,
};
export default _default;

/* =================== Stats/vol helpers (daily log returns) =================== */

/**
 * Compute daily log returns from a price array.
 * Accepts numbers or objects with {close} / {value}. Filters non-positive or NaN.
 * @param {Array<number|object>} series
 * @returns {number[]} array of ln(P_t / P_{t-1})
 */
export function logReturns(series = []) {
  const vals = Array.isArray(series)
    ? series.map((x) =>
        typeof x === "number"
          ? x
          : (_num(x?.close) ? x.close : _num(x?.value) ? x.value : Number(x))
      )
    : [];
  const logs = [];
  for (let i = 1; i < vals.length; i++) {
    const p0 = Number(vals[i - 1]);
    const p1 = Number(vals[i]);
    if (_pos(p0) && _pos(p1)) logs.push(Math.log(p1 / p0));
  }
  return logs;
}

/**
 * From an array of DAILY log returns, compute daily & annualized stats.
 * Returns multiple alias keys so legacy callers are covered.
 * @param {number[]} logs - daily log returns
 * @param {number} [basis=252] - trading days per year
 * @returns {object} stats with daily & annual means/vols
 */
export function annualizedFromDailyLogs(logs = [], basis = 252) {
  const xs = (Array.isArray(logs) ? logs : []).filter(_num);
  const n = xs.length;
  if (n === 0) {
    return {
      meanDaily: null, stdevDaily: null,
      meanAnnual: null, stdevAnnual: null,
      // aliases
      muDaily: null, sigmaDaily: null,
      muAnn: null, sigmaAnn: null,
      meanAnn: null, stdevAnn: null,
      n: 0, basis
    };
  }
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const varPop = xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n;
  const stdev = Math.sqrt(Math.max(0, varPop));
  const meanAnnual = mean * basis;
  const stdevAnnual = stdev * Math.sqrt(basis);
  return {
    meanDaily: mean,
    stdevDaily: stdev,
    meanAnnual,
    stdevAnnual,
    // aliases for compatibility
    muDaily: mean,
    sigmaDaily: stdev,
    muAnn: meanAnnual,
    sigmaAnn: stdevAnnual,
    meanAnn: meanAnnual,
    stdevAnn: stdevAnnual,
    n, basis
  };
}

/* =================== Standalone RN Vega exports (compat) =================== */
/** Vega per 1.00 change in sigma (NOT per 1%). Risk-neutral with carry q.
 *  Signatures:
 *    vega(S0, K, r, q, sigma, T)
 *    vega({ S0, K, T, sigma, r=0, q=0 })
 */
export function vega(/* (S0,K,r,q,sigma,T) OR {S0,K,T,sigma,r,q} */) {
  const p = _parseBSArgs(arguments);
  const S0 = Number(p.S0), K = Number(p.K);
  const T  = Math.max(Number(p.T) || 0, 0);
  const sig = Math.max(Number(p.sigma) || 0, 0);
  const r = Number(p.r) || 0, q = Number(p.q) || 0;
  if (!(S0 > 0 && K > 0 && sig > 0 && T > 0)) return 0;

  const _d1 = d1(S0, K, r, q, sig, T);
  // S e^{-qT} φ(d1) √T
  return S0 * Math.exp(-q * T) * phi(_d1) * Math.sqrt(T);
}

/** Vega per 1% vol (i.e., vega/100). Matches greeks helpers returned scale. */
export function vegaPct(/* same signatures as vega */) {
  return vega.apply(null, arguments) / 100;
}

/* ================= Strategy alias shims (compat) ================= */
/** Back-compat: some components import these names directly from "lib/quant/index.js". */
export function computeStrategyMetrics(legs = [], ctx = {}) {
  return aggregateStrategyMetrics(legs, ctx);
}
export function strategyMetrics(legs = [], ctx = {}) {
  return aggregateStrategyMetrics(legs, ctx);
}

/* ========================== CAPM helpers (central) ========================== */

/**
 * CAPM expected return:
 *  - Provide either 'erp' (market equity risk premium) OR 'mktEr'/'rm' (E[Rm]).
 *  - rf, beta are annual decimals.
 */
export function capmExpectedReturn({ rf = 0, beta = 1, erp, mktEr, rm } = {}) {
  const RF = Number(rf) || 0;
  const B  = Number(beta) || 0;
  const ERP = Number(erp ?? ( (mktEr ?? rm) != null ? (Number(mktEr ?? rm) - RF) : 0 ));
  return RF + B * ERP;
}

/** Jensen's alpha: realized/assumed Ri minus its CAPM-implied return. */
export function capmAlpha({ ri, rf = 0, beta = 1, erp, mktEr, rm } = {}) {
  const Ri = Number(ri);
  const capm = capmExpectedReturn({ rf, beta, erp, mktEr, rm });
  return Ri - capm;
}

/** Beta from covariance & market variance. */
export function betaFromCovVar({ covRmRi, varRm } = {}) {
  const cov = Number(covRmRi);
  const v   = Number(varRm);
  if (!Number.isFinite(cov) || !Number.isFinite(v) || v === 0) return null;
  return cov / v;
}

/** Beta from correlation and standard deviations. */
export function betaFromCorr({ corr, stdevAsset, stdevMkt } = {}) {
  const rho = Number(corr);
  const sa  = Number(stdevAsset);
  const sm  = Number(stdevMkt);
  if (![rho, sa, sm].every(Number.isFinite) || sm === 0) return null;
  return rho * (sa / sm);
}

/**
 * Convenience: compute a physical drift μ from CAPM inputs.
 * Use with driftFromMode({ mode: 'CAPM', muCapm: driftFromCAPM(...) }).
 */
export function driftFromCAPM({ rf = 0, beta = 1, erp, mktEr, rm } = {}) {
  return capmExpectedReturn({ rf, beta, erp, mktEr, rm });
}

/* ======================= Implied Volatility (central) ======================= */

/**
 * Robust implied volatility solver for European options (BSM with q).
 * Uses Newton–Raphson with vega (per 1.00 vol) and bisection fallback.
 *
 * @param {"call"|"put"} type
 * @param {number} price    target market premium (per share, >= 0)
 * @param {number} S0       spot
 * @param {number} K        strike
 * @param {number} T        years
 * @param {number} [r=0]    risk-free (cont)
 * @param {number} [q=0]    dividend yield (cont)
 * @param {number} [sigmaInit=0.2] initial guess
 * @param {number} [tol=1e-8]  absolute price tolerance
 * @param {number} [maxIter=50]
 * @returns {number|null} sigma or null if unsolvable / out-of-bounds
 */
export function impliedVol({
  type,
  price,
  S0,
  K,
  T,
  r = 0,
  q = 0,
  sigmaInit = 0.2,
  tol = 1e-8,
  maxIter = 50,
} = {}) {
  const s0 = Number(S0), k = Number(K), t = Number(T);
  const rr = Number(r) || 0, qq = Number(q) || 0;
  const target = Number(price);
  if (!(_pos(s0) && _pos(k) && _pos(t)) || !(target >= 0)) return null;

  // No time → intrinsic only; vol undefined unless price == intrinsic
  if (!(t > 0)) {
    const intr = type === "call" ? Math.max(s0 - k, 0) : Math.max(k - s0, 0);
    return Math.abs(target - intr) <= tol ? 0 : null;
  }

  // Arbitrage bounds under carry q and discount r
  const dfS = Math.exp(-qq * t), dfK = Math.exp(-rr * t);
  const lower = type === "call" ? Math.max(0, s0 * dfS - k * dfK) : Math.max(0, k * dfK - s0 * dfS);
  const upper = type === "call" ? s0 * dfS : k * dfK;
  if (target < lower - 1e-10 || target > upper + 1e-10) return null;

  // Model & vega (per 1.00 volatility)
  const priceModel = (sig) =>
    type === "call"
      ? callPrice({ S0: s0, K: k, T: t, sigma: sig, r: rr, q: qq })
      : putPrice({ S0: s0, K: k, T: t, sigma: sig, r: rr, q: qq });
  const vegaPer1 = (sig) => vega(s0, k, rr, qq, sig, t); // per 1.00

  // Newton iteration (clamped)
  let sigma = Math.min(5, Math.max(1e-6, Number(sigmaInit) || 0.2));
  let f = priceModel(sigma) - target;
  if (Math.abs(f) <= tol) return sigma;
  for (let i = 0; i < maxIter; i++) {
    const v = vegaPer1(sigma);
    if (!Number.isFinite(v) || Math.abs(v) < 1e-10) break;
    sigma = Math.min(5, Math.max(1e-6, sigma - f / v));
    f = priceModel(sigma) - target;
    if (Math.abs(f) <= tol) return sigma;
  }

  // Bisection fallback
  let lo = 1e-6, hi = Math.max(1, sigma * 2);
  let flo = priceModel(lo) - target;
  let fhi = priceModel(hi) - target;
  let grow = 0;
  while (flo * fhi > 0 && hi < 5 && grow < 25) {
    hi = Math.min(5, hi * 1.6);
    fhi = priceModel(hi) - target;
    grow++;
  }
  if (flo * fhi > 0) return Math.abs(f) <= 1e-6 ? sigma : null;

  for (let i = 0; i < 80; i++) {
    const mid = 0.5 * (lo + hi);
    const fm = priceModel(mid) - target;
    if (Math.abs(fm) <= tol) return mid;
    if (flo * fm <= 0) {
      hi = mid; fhi = fm;
    } else {
      lo = mid; flo = fm;
    }
  }
  return 0.5 * (lo + hi);
}

/** Convenience wrappers (object or positional). */
export function impliedVolCall(...args) {
  if (args.length === 1 && typeof args[0] === "object") {
    return impliedVol({ ...args[0], type: "call" });
  }
  const [price, S0, K, T, r = 0, q = 0, sigmaInit = 0.2] = args;
  return impliedVol({ type: "call", price, S0, K, T, r, q, sigmaInit });
}
export function impliedVolPut(...args) {
  if (args.length === 1 && typeof args[0] === "object") {
    return impliedVol({ ...args[0], type: "put" });
  }
  const [price, S0, K, T, r = 0, q = 0, sigmaInit = 0.2] = args;
  return impliedVol({ type: "put", price, S0, K, T, r, q, sigmaInit });
}