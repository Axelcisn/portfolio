// components/Strategy/payoffUtils.js
"use client";

/* -------- leg helpers -------- */
export const isShort = (pos) => /Short/.test(pos);
export const isCall  = (pos) => /Call/.test(pos);
export const isPut   = (pos)  => /Put/.test(pos);

/* Sign convention (premium):
   short = + (credit), long = − (debit) — scaled by contractSize */
export function netCredit(rows, contractSize = 1) {
  let sum = 0;
  for (const r of rows) {
    const vol = Number(r.volume || 0);
    const prem = Number(r.premium || 0);
    if (!Number.isFinite(vol) || !Number.isFinite(prem)) continue;
    sum += (isShort(r.position) ? +1 : -1) * vol * prem;
  }
  return sum * (Number(contractSize) || 1);
}

/* How many option contracts in total (abs volumes) — used for commission */
export function contractsCount(rows) {
  return rows.reduce((acc, r) => acc + Math.abs(Number(r.volume || 0)), 0);
}

/* Expiry payoff for a single leg (per contract, *excluding* premium) */
export function legPayoff(ST, r) {
  const K = Number(r.strike);
  const q = Number(r.volume || 0);
  if (!Number.isFinite(K) || !Number.isFinite(q)) return 0;
  let p = 0;
  if (isCall(r.position)) p = Math.max(ST - K, 0);
  if (isPut(r.position))  p = Math.max(K - ST, 0);
  const sign = isShort(r.position) ? -1 : +1; // short loses intrinsic
  return sign * q * p;
}

/* Total expiry payoff across legs (per contract) then scaled by contractSize */
export function expiryPayoff(ST, rows, contractSize = 1) {
  const perContract = rows.reduce((acc, r) => acc + legPayoff(ST, r), 0);
  return perContract * (Number(contractSize) || 1);
}

/* Build X grid and compute P&L = expiryPayoff + offset
   where offset typically = netCredit - commissions */
export function buildPayoffSeries({ lo, hi, rows, contractSize = 1, n = 400, offset = 0 }) {
  const xs = Array.from({ length: n }, (_, i) => lo + (i * (hi - lo)) / (n - 1));
  const ys = xs.map((ST) => expiryPayoff(ST, rows, contractSize) + (Number(offset) || 0));
  return { xs, ys, offset: Number(offset) || 0 };
}

/* Find break-evens by linear interpolation between sign changes */
export function findBreakEvens(xs, ys) {
  const out = [];
  for (let i = 1; i < xs.length; i++) {
    const y0 = ys[i - 1], y1 = ys[i];
    if (!Number.isFinite(y0) || !Number.isFinite(y1)) continue;
    if (y0 === 0) out.push(xs[i - 1]);
    if ((y0 < 0 && y1 > 0) || (y0 > 0 && y1 < 0)) {
      const t = y0 / (y0 - y1);
      out.push(xs[i - 1] + t * (xs[i] - xs[i - 1]));
    }
  }
  return Array.from(new Set(out.map((v) => +v.toFixed(4)))).sort((a, b) => a - b);
}

/* Formatting */
export function fmtCur(v, ccy = "USD") {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: ccy,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return (ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : "$") + n.toFixed(2);
  }
}
