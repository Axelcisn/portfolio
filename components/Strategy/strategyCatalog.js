// components/Strategy/strategyCatalog.js

// Helper: round to 2 decimals
const r2 = (n) => Math.round(n * 100) / 100;

// Helper: seed strike/premium with rule -> strike = spot + 1, premium = 1..10 cycling
export function seedLegs(legs, spot) {
  let p = 1;
  const S = Number(spot) || 0;
  return legs.map((leg) => {
    const isStock = leg.position === "Long Stock" || leg.position === "Short Stock";
    const seeded = { ...leg, volume: leg.volume ?? 1 };
    if (!isStock) {
      seeded.strike = r2(S + 1);
      seeded.premium = p;
      p = p === 10 ? 1 : p + 1;
    } else {
      // stock has no strike/premium
      seeded.strike = null;
      seeded.premium = 0;
    }
    return seeded;
  });
}

/**
 * Canonical catalog with fixed legs/volumes only.
 * Strikes/Premiums are assigned at runtime via seedLegs(…, spot).
 */
export const CATALOG = [
  { id: "long-call", name: "Long Call", direction: "Bullish", legs: [{ position: "Long Call", volume: 1 }] },
  { id: "short-call", name: "Short Call", direction: "Bearish", legs: [{ position: "Short Call", volume: 1 }] },
  { id: "long-put", name: "Long Put", direction: "Bearish", legs: [{ position: "Long Put", volume: 1 }] },
  { id: "short-put", name: "Short Put", direction: "Bullish", legs: [{ position: "Short Put", volume: 1 }] },

  // Stock‑based
  { id: "covered-call", name: "Covered Call", direction: "Neutral", legs: [{ position: "Long Stock", volume: 1 }, { position: "Short Call", volume: 1 }] },
  { id: "protective-put", name: "Protective Put", direction: "Bullish", legs: [{ position: "Long Stock", volume: 1 }, { position: "Long Put", volume: 1 }] },
  { id: "collar", name: "Collar", direction: "Neutral", legs: [{ position: "Long Stock", volume: 1 }, { position: "Long Put", volume: 1 }, { position: "Short Call", volume: 1 }] },

  // Spreads
  { id: "bear-call-spread", name: "Bear Call Spread", direction: "Bearish", legs: [{ position: "Short Call", volume: 1 }, { position: "Long Call", volume: 1 }] },
  { id: "bull-put-spread", name: "Bull Put Spread", direction: "Bullish", legs: [{ position: "Short Put", volume: 1 }, { position: "Long Put", volume: 1 }] },
  { id: "bear-put-spread", name: "Bear Put Spread", direction: "Bearish", legs: [{ position: "Long Put", volume: 1 }, { position: "Short Put", volume: 1 }] },

  // Straddles / Strangles
  { id: "long-straddle", name: "Long Straddle", direction: "Neutral", legs: [{ position: "Long Call", volume: 1 }, { position: "Long Put", volume: 1 }] },
  { id: "short-straddle", name: "Short Straddle", direction: "Neutral", legs: [{ position: "Short Call", volume: 1 }, { position: "Short Put", volume: 1 }] },
  { id: "long-strangle", name: "Long Strangle", direction: "Neutral", legs: [{ position: "Long Call", volume: 1 }, { position: "Long Put", volume: 1 }] },
  { id: "short-strangle", name: "Short Strangle", direction: "Neutral", legs: [{ position: "Short Call", volume: 1 }, { position: "Short Put", volume: 1 }] },

  // Time structures (calendar/diagonal — expiries handled later)
  { id: "call-calendar", name: "Call Calendar", direction: "Neutral", legs: [{ position: "Long Call", volume: 1 }, { position: "Short Call", volume: 1 }] },
  { id: "put-calendar", name: "Put Calendar", direction: "Neutral", legs: [{ position: "Long Put", volume: 1 }, { position: "Short Put", volume: 1 }] },
  { id: "call-diagonal", name: "Call Diagonal", direction: "Directional", legs: [{ position: "Long Call", volume: 1 }, { position: "Short Call", volume: 1 }] },
  { id: "put-diagonal", name: "Put Diagonal", direction: "Directional", legs: [{ position: "Long Put", volume: 1 }, { position: "Short Put", volume: 1 }] },

  // Butterflies / Condors
  { id: "call-butterfly", name: "Call Butterfly", direction: "Neutral", legs: [{ position: "Long Call", volume: 1 }, { position: "Short Call", volume: 2 }, { position: "Long Call", volume: 1 }] },
  { id: "put-butterfly", name: "Put Butterfly", direction: "Neutral", legs: [{ position: "Long Put", volume: 1 }, { position: "Short Put", volume: 2 }, { position: "Long Put", volume: 1 }] },
  { id: "iron-butterfly", name: "Iron Butterfly", direction: "Neutral", legs: [{ position: "Short Call", volume: 1 }, { position: "Short Put", volume: 1 }, { position: "Long Call", volume: 1 }, { position: "Long Put", volume: 1 }] },
  { id: "iron-condor", name: "Iron Condor", direction: "Neutral", legs: [{ position: "Short Put", volume: 1 }, { position: "Long Put", volume: 1 }, { position: "Short Call", volume: 1 }, { position: "Long Call", volume: 1 }] },
  { id: "reverse-condor", name: "Reverse Condor", direction: "Neutral", legs: [{ position: "Long Put", volume: 1 }, { position: "Short Put", volume: 1 }, { position: "Long Call", volume: 1 }, { position: "Short Call", volume: 1 }] },

  // Ratios / Backspreads
  { id: "call-backspread", name: "Call Backspread", direction: "Bullish", legs: [{ position: "Short Call", volume: 1 }, { position: "Long Call", volume: 2 }] },
  { id: "put-backspread", name: "Put Backspread", direction: "Bearish", legs: [{ position: "Short Put", volume: 1 }, { position: "Long Put", volume: 2 }] },
  { id: "call-ratio", name: "Call Ratio", direction: "Directional", legs: [{ position: "Long Call", volume: 1 }, { position: "Short Call", volume: 2 }] },
  { id: "put-ratio", name: "Put Ratio", direction: "Directional", legs: [{ position: "Long Put", volume: 1 }, { position: "Short Put", volume: 2 }] },

  // Boxes
  { id: "long-box", name: "Long Box", direction: "Neutral", legs: [{ position: "Long Call", volume: 1 }, { position: "Short Call", volume: 1 }, { position: "Long Put", volume: 1 }, { position: "Short Put", volume: 1 }] },
  { id: "short-box", name: "Short Box", direction: "Neutral", legs: [{ position: "Short Call", volume: 1 }, { position: "Long Call", volume: 1 }, { position: "Short Put", volume: 1 }, { position: "Long Put", volume: 1 }] },

  // Others
  { id: "strap", name: "Strap", direction: "Bullish", legs: [{ position: "Long Call", volume: 2 }, { position: "Long Put", volume: 1 }] },
  { id: "reversal", name: "Reversal", direction: "Arbitrage", legs: [{ position: "Short Stock", volume: 1 }, { position: "Long Call", volume: 1 }, { position: "Short Put", volume: 1 }] },
  { id: "stock-repair", name: "Stock Repair", direction: "Bullish", legs: [{ position: "Long Stock", volume: 1 }, { position: "Long Call", volume: 1 }, { position: "Short Call", volume: 2 }] },

  // LEAPS shown as long‑dated call; legs are still a single call
  { id: "leaps", name: "LEAPS", direction: "Bullish", legs: [{ position: "Long Call", volume: 1 }] },
];

// Build seeded list for a given spot
export function buildStrategyList(spot) {
  return CATALOG.map((s) => ({ ...s, legs: seedLegs(s.legs, spot) }));
}
