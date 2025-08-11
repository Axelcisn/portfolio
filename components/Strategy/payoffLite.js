// components/Strategy/payoffLite.js
// Minimal payoff utilities used by the in‑modal chart.

const POS = {
  "Long Call": "LC",
  "Short Call": "SC",
  "Long Put": "LP",
  "Short Put": "SP",
};

// P&L at expiration for a *single* leg (per contract)
export function legPnLAt(S, leg) {
  const K = Number(leg.strike);
  const q = Number(leg.volume) || 0;
  const prem = Number(leg.premium) || 0;
  if (!Number.isFinite(K) || q === 0) return 0;

  switch (leg.position) {
    case "Long Call":  return q * (Math.max(S - K, 0) - prem);
    case "Short Call": return q * (prem - Math.max(S - K, 0));
    case "Long Put":   return q * (Math.max(K - S, 0) - prem);
    case "Short Put":  return q * (prem - Math.max(K - S, 0));
    default: return 0;
  }
}

// Aggregate P&L at expiration for a set of legs (per contract)
export function pnlAtS(S, legs) {
  let sum = 0;
  for (const leg of legs || []) sum += legPnLAt(S, leg);
  return sum;
}

// Build arrays for plotting across a domain.
// contractSize scales the per‑contract P&L (e.g., 100 for equity options).
export function gridPnl(legs, minX, maxX, steps = 240, contractSize = 100) {
  const X = new Array(steps);
  const Y = new Array(steps);
  const dx = (maxX - minX) / (steps - 1);

  for (let i = 0; i < steps; i++) {
    const S = minX + dx * i;
    X[i] = S;
    Y[i] = pnlAtS(S, legs) * contractSize;
  }
  return { X, Y };
}

// Small helper to dedupe strikes for vertical markers
export function uniqueStrikes(legs) {
  const set = new Set();
  for (const l of legs || []) {
    const k = Number(l.strike);
    if (Number.isFinite(k)) set.add(k);
  }
  return Array.from(set).sort((a, b) => a - b);
}
