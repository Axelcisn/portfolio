// components/Strategy/assignStrategy.js
// Canonical strategy catalog (fixed legs & volumes). No auto strikes/premiums.

const ROLE_LABEL = {
  lc: "Long Call",
  sc: "Short Call",
  lp: "Long Put",
  sp: "Short Put",
};

/**
 * order rules describe strike ordering constraints:
 *  - "X1"            : single leg
 *  - "X1<X2"         : two ordered strikes
 *  - "X1=X2"         : same strike (straddle)
 *  - "X1<X2<X3"      : three ordered strikes
 *  - "X1<X2<X3<X4"   : four ordered strikes
 */
export const STRATEGY_CATALOG = [
  // Singles
  { id: "long-call",  name: "Long Call",  direction: "Bullish",
    legs: [{ role: "lc", qty: 1 }], order: "X1" },
  { id: "short-call", name: "Short Call", direction: "Bearish",
    legs: [{ role: "sc", qty: 1 }], order: "X1" },
  { id: "long-put",   name: "Long Put",   direction: "Bearish",
    legs: [{ role: "lp", qty: 1 }], order: "X1" },
  { id: "short-put",  name: "Short Put",  direction: "Bullish",
    legs: [{ role: "sp", qty: 1 }], order: "X1" },

  // Verticals
  { id: "bull-call-spread", name: "Bull Call Spread", direction: "Bullish",
    legs: [{ role: "lc", qty: 1 }, { role: "sc", qty: 1 }], order: "X1<X2" },
  { id: "bear-call-spread", name: "Bear Call Spread", direction: "Bearish",
    legs: [{ role: "sc", qty: 1 }, { role: "lc", qty: 1 }], order: "X1<X2" },
  { id: "bull-put-spread",  name: "Bull Put Spread",  direction: "Bullish",
    legs: [{ role: "sp", qty: 1 }, { role: "lp", qty: 1 }], order: "X1<X2" },
  { id: "bear-put-spread",  name: "Bear Put Spread",  direction: "Bearish",
    legs: [{ role: "lp", qty: 1 }, { role: "sp", qty: 1 }], order: "X1<X2" },

  // Straddles / Strangles
  { id: "long-straddle",  name: "Long Straddle",  direction: "Neutral",
    legs: [{ role: "lc", qty: 1 }, { role: "lp", qty: 1 }], order: "X1=X2" },
  { id: "short-straddle", name: "Short Straddle", direction: "Neutral",
    legs: [{ role: "sc", qty: 1 }, { role: "sp", qty: 1 }], order: "X1=X2" },
  { id: "long-strangle",  name: "Long Strangle",  direction: "Neutral",
    legs: [{ role: "lp", qty: 1 }, { role: "lc", qty: 1 }], order: "X1<X2" },
  { id: "short-strangle", name: "Short Strangle", direction: "Neutral",
    legs: [{ role: "sp", qty: 1 }, { role: "sc", qty: 1 }], order: "X1<X2" },

  // Butterflies
  { id: "call-butterfly", name: "Call Butterfly", direction: "Neutral",
    legs: [{ role: "lc", qty: 1 }, { role: "sc", qty: 2 }, { role: "lc", qty: 1 }],
    order: "X1<X2<X3" },
  { id: "put-butterfly",  name: "Put Butterfly",  direction: "Neutral",
    legs: [{ role: "lp", qty: 1 }, { role: "sp", qty: 2 }, { role: "lp", qty: 1 }],
    order: "X1<X2<X3" },

  // Irons
  { id: "iron-condor", name: "Iron Condor", direction: "Neutral",
    legs: [
      { role: "sp", qty: 1 }, // X1 (lowest)
      { role: "lp", qty: 1 }, // X2
      { role: "sc", qty: 1 }, // X3
      { role: "lc", qty: 1 }, // X4 (highest)
    ],
    order: "X1<X2<X3<X4" },

  { id: "iron-butterfly", name: "Iron Butterfly", direction: "Neutral",
    legs: [
      { role: "lp", qty: 1 }, // X1
      { role: "sp", qty: 1 }, // X2 (center)
      { role: "sc", qty: 1 }, // X2 (center)
      { role: "lc", qty: 1 }, // X3
    ],
    order: "X1<X2<X3" },
];

/* ------------------------------- Queries --------------------------------- */
export function getAllStrategies() {
  return STRATEGY_CATALOG.slice();
}
export function getStrategyById(id) {
  return STRATEGY_CATALOG.find((s) => s.id === id) || null;
}

/* ----------------------------- Instantiation ----------------------------- */

function rowsFromCatalogEntry(entry) {
  const rows = [];
  if (!entry) return rows;
  for (const leg of entry.legs) {
    const label = ROLE_LABEL[leg.role];
    if (!label) continue;
    rows.push({
      position: label,
      strike: null,     // you will set this in the control panel
      volume: Number(leg.qty || 0),
      premium: null,    // you will set this in the control panel
    });
  }
  return rows;
}

function keyedFromRows(rows) {
  // IMPORTANT: legs start disabled until a valid strike is provided.
  const mk = () => ({ enabled: false, K: null, qty: 0, premium: null });
  const keyed = { lc: mk(), sc: mk(), lp: mk(), sp: mk() };

  for (const r of rows) {
    const qty = Number(r.volume || 0);
    const data = { enabled: false, K: null, qty, premium: null }; // keep disabled; strike is null
    const pos = (r.position || "").toLowerCase();
    if (pos.includes("long call"))  keyed.lc = data;
    else if (pos.includes("short call")) keyed.sc = data;
    else if (pos.includes("long put"))   keyed.lp = data;
    else if (pos.includes("short put"))  keyed.sp = data;
  }
  return keyed;
}

function lotSizeFromKeyed(legs) {
  const abs = (x) => Math.abs(Number(x || 0));
  return abs(legs.lc.qty) + abs(legs.sc.qty) + abs(legs.lp.qty) + abs(legs.sp.qty);
}

/** Sum net premium with the standard sign convention (long = debit, short = credit). */
export function calculateNetPremium(legs) {
  const n = (v) => Number(v || 0);
  const longDebit  = n(legs?.lc?.premium) * n(legs?.lc?.qty) + n(legs?.lp?.premium) * n(legs?.lp?.qty);
  const shortCredit = n(legs?.sc?.premium) * n(legs?.sc?.qty) + n(legs?.sp?.premium) * n(legs?.sp?.qty);
  return longDebit - shortCredit;
}

/**
 * Instantiate a strategy into legs that are ready for manual input
 * (strikes & premiums are null; legs disabled until you set them).
 */
export function instantiateStrategy(id) {
  const entry = getStrategyById(id) || { id, name: id, legs: [], order: "X1" };
  const rows = rowsFromCatalogEntry(entry);
  const legsKeyed = keyedFromRows(rows);
  const lotSize = lotSizeFromKeyed(legsKeyed);

  return {
    id: entry.id,
    name: entry.name,
    rows,
    legsKeyed,
    netPremium: 0,
    meta: { order: entry.order, lotSize },
  };
}
