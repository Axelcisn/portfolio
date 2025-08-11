// components/Strategy/math/ci.js

/**
 * 95% lognormal price confidence interval at expiry (risk-neutral).
 * S_T ~ LogN( m, v ), with
 *   m = ln(S0) + (r - 0.5*sigma^2)*T
 *   v = (sigma^2)*T
 * CI95 = [ exp(m - 1.96*sqrt(v)), exp(m + 1.96*sqrt(v)) ]
 */
export function ci95(S0, r = 0, sigma = 0.2, T = 30 / 365) {
  const S = Number(S0);
  const vol = Math.max(0, Number(sigma));
  const t = Math.max(0, Number(T));
  if (!isFinite(S) || S <= 0 || !isFinite(vol) || !isFinite(t)) {
    return { lo: NaN, hi: NaN };
  }
  const m = Math.log(S) + (r - 0.5 * vol * vol) * t;
  const v = vol * Math.sqrt(t);
  const lo = Math.exp(m - 1.96 * v);
  const hi = Math.exp(m + 1.96 * v);
  return { lo, hi };
}

/** Risk-neutral mean price at expiry: E[S_T] = S0 * exp(r*T) */
export function meanPrice(S0, r = 0, T = 30 / 365) {
  const S = Number(S0);
  const t = Math.max(0, Number(T));
  if (!isFinite(S) || S <= 0 || !isFinite(t)) return NaN;
  return S * Math.exp(r * t);
}
