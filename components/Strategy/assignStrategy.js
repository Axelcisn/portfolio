// components/Strategy/assignStrategy.js
// Self‑contained strategy catalog + seeding helpers.
// Legs here are the *canonical* structure (positions + volumes only).
// Seeding fills in placeholder strikes/premiums so the UI can render immediately.

/**
 * Allowed positions (keep in sync with StrategyModal / toChartLegs):
 *  - "Long Call"  | "Short Call"
 *  - "Long Put"   | "Short Put"
 */

const DIR = {
  BULL: "Bullish",
  BEAR: "Bearish",
  NEUTRAL: "Neutral",
};

const P = {
  LC: "Long Call",
  SC: "Short Call",
  LP: "Long Put",
  SP: "Short Put",
};

// tiny helper to define a leg skeleton (no strike/premium yet)
const L = (position, volume) => ({
  position,
  volume: Number(volume) || 0,
  strike: null,
  premium: null,
});

// ---------- Canonical catalog (legs + volumes only) ----------
/**
 * NOTE about complex structures:
 * Some strategies (e.g., butterflies) require multiple strikes of the same
 * option type. Our current chart accepts one leg per type (lc/sc/lp/sp),
 * so for now we encode *aggregate volumes* (e.g., Call Butterfly => LC:2, SC:2).
 * Strikes are seeded uniformly (spot + 1) until proper strike mapping is added.
 */
export const CATALOG = [
  // --- Single‑leg
  { id: "long-call",        name: "Long Call",        direction: DIR.BULL,   legs: [L(P.LC, 1)] },
  { id: "long-put",         name: "Long Put",         direction: DIR.BEAR,   legs: [L(P.LP, 1)] },
  { id: "short-call",       name: "Short Call",       direction: DIR.BEAR,   legs: [L(P.SC, 1)] },
  { id: "short-put",        name: "Short Put",        direction: DIR.BULL,   legs: [L(P.SP, 1)] },
  { id: "protective-put",   name: "Protective Put",   direction: DIR.BEAR,   legs: [L(P.LP, 1)] },     // stock omitted
  { id: "leaps",            name: "LEAPS",            direction: DIR.BULL,   legs: [L(P.LC, 1)] },     // long‑dated call

  // --- Vertical Spreads
  { id: "bear-call-spread", name: "Bear Call Spread", direction: DIR.BEAR,   legs: [L(P.SC, 1), L(P.LC, 1)] },
  { id: "bull-put-spread",  name: "Bull Put Spread",  direction: DIR.BULL,   legs: [L(P.SP, 1), L(P.LP, 1)] },
  { id: "bear-put-spread",  name: "Bear Put Spread",  direction: DIR.BEAR,   legs: [L(P.LP, 1), L(P.SP, 1)] },

  // --- Straddles & Strangles
  { id: "long-straddle",    name: "Long Straddle",    direction: DIR.NEUTRAL, legs: [L(P.LC, 1), L(P.LP, 1)] },
  { id: "short-straddle",   name: "Short Straddle",   direction: DIR.NEUTRAL, legs: [L(P.SC, 1), L(P.SP, 1)] },
  { id: "long-strangle",    name: "Long Strangle",    direction: DIR.NEUTRAL, legs: [L(P.LC, 1), L(P.LP, 1)] },
  { id: "short-strangle",   name: "Short Strangle",   direction: DIR.NEUTRAL, legs: [L(P.SC, 1), L(P.SP, 1)] },

  // --- Calendars & Diagonals (expiry differences not modeled yet)
  { id: "call-calendar",    name: "Call Calendar",    direction: DIR.NEUTRAL, legs: [L(P.LC, 1), L(P.SC, 1)] },
  { id: "put-calendar",     name: "Put Calendar",     direction: DIR.NEUTRAL, legs: [L(P.LP, 1), L(P.SP, 1)] },
  { id: "call-diagonal",    name: "Call Diagonal",    direction: DIR.BULL,    legs: [L(P.LC, 1), L(P.SC, 1)] },
  { id: "put-diagonal",     name: "Put Diagonal",     direction: DIR.BEAR,    legs: [L(P.LP, 1), L(P.SP, 1)] },

  // --- Butterflies & Condors (aggregate volumes)
  { id: "iron-condor",      name: "Iron Condor",      direction: DIR.NEUTRAL, legs: [L(P.SC, 1), L(P.LC, 1), L(P.SP, 1), L(P.LP, 1)] },
  { id: "reverse-condor",   name: "Reverse Condor",   direction: DIR.NEUTRAL, legs: [L(P.LC, 1), L(P.SC, 1), L(P.LP, 1), L(P.SP, 1)] },
  { id: "call-butterfly",   name: "Call Butterfly",   direction: DIR.NEUTRAL, legs: [L(P.LC, 2), L(P.SC, 2)] },
  { id: "put-butterfly",    name: "Put Butterfly",    direction: DIR.NEUTRAL, legs: [L(P.LP, 2), L(P.SP, 2)] },
  { id: "reverse-butterfly",name: "Reverse Butterfly",direction: DIR.NEUTRAL, legs: [L(P.SC, 2), L(P.LC, 2)] },
  { id: "iron-butterfly",   name: "Iron Butterfly",   direction: DIR.NEUTRAL, legs: [L(P.SC, 1), L(P.SP, 1), L(P.LC, 1), L(P.LP, 1)] },

  // --- Ratios & Backspreads (aggregate)
  { id: "call-ratio",       name: "Call Ratio",       direction: DIR.BULL,    legs: [L(P.LC, 2), L(P.SC, 1)] },
  { id: "put-ratio",        name: "Put Ratio",        direction: DIR.BEAR,    legs: [L(P.LP, 2), L(P.SP, 1)] },
  { id: "call-backspread",  name: "Call Backspread",  direction: DIR.BULL,    legs: [L(P.LC, 2), L(P.SC, 1)] },
  { id: "put-backspread",   name: "Put Backspread",   direction: DIR.BEAR,    legs: [L(P.LP, 2), L(P.SP, 1)] },

  // --- Other multi‑leg (stock legs omitted / approximated with options only)
  { id: "covered-call",     name: "Covered Call",     direction: DIR.BEAR,    legs: [L(P.SC, 1)] }, // stock not modeled
  { id: "covered-put",      name: "Covered Put",      direction: DIR.BEAR,    legs: [L(P.SP, 1)] }, // stock not modeled
  { id: "collar",           name: "Collar",           direction: DIR.NEUTRAL, legs: [L(P.LP, 1), L(P.SC, 1)] },
  { id: "strap",            name: "Strap",            direction: DIR.BULL,    legs: [L(P.LC, 2), L(P.LP, 1)] },
  { id: "long-box",         name: "Long Box",         direction: DIR.NEUTRAL, legs: [L(P.LC, 1), L(P.SC, 1), L(P.LP, 1), L(P.SP, 1)] },
  { id: "short-box",        name: "Short Box",        direction: DIR.NEUTRAL, legs: [L(P.SC, 1), L(P.LC, 1), L(P.SP, 1), L(P.LP, 1)] },
  { id: "reversal",         name: "Reversal",         direction: DIR.BULL,    legs: [L(P.LC, 1), L(P.SP, 1)] }, // synthetic long stock
  { id: "stock-repair",     name: "Stock Repair",     direction: DIR.BULL,    legs: [L(P.LC, 1), L(P.SC, 2)] },

  // --- Manual (empty template)
  { id: "manual",           name: "Manual",           direction: DIR.NEUTRAL, legs: [] },
];

// ---------- Seeding helpers ----------

/**
 * Seed legs with placeholder values so the UI can open immediately.
 * - strike: spot + 1  (rounded to 2dp)
 * - premium: 1..10 (cycles if legs > 10)
 */
export function seedLegs(legs, spot) {
  const s = Number(spot);
  const seededStrike = Number.isFinite(s) ? Math.round((s + 1) * 100) / 100 : 1;

  return (legs || []).map((leg, idx) => ({
    position: leg.position,
    volume: Number(leg.volume) || 0,
    strike: seededStrike,
    premium: (idx % 10) + 1, // 1..10
  }));
}

/** Build a full seeded list for a given spot. */
export function buildStrategyList(spot) {
  return CATALOG.map((s) => ({
    ...s,
    legs: seedLegs(s.legs, spot),
  }));
}

/** Get a single strategy (seeded). */
export function getStrategyById(id, spot) {
  const base = CATALOG.find((s) => s.id === id);
  if (!base) return null;
  return { ...base, legs: seedLegs(base.legs, spot) };
}

/** Get canonical (unseeded) definition. */
export function getCanonical(id) {
  return CATALOG.find((s) => s.id === id) || null;
}

/** Convenience: get all (seeded). */
export function getAllStrategies(spot) {
  return buildStrategyList(spot);
}
