// components/Strategy/defs/strategyTemplates.js

/**
 * Default legs for each strategy.
 * Shape of a leg:
 *   { type: 'lc'|'sc'|'lp'|'sp'|'ls'|'ss', qty: number, expiry: 'card' | 'card+30' | number }
 *
 * Notes
 * - 'card'     => use the Time (days) from the company card.
 * - 'card+30'  => Time from the card + 30 days (for the farther leg in calendars/diagonals).
 * - number     => fixed days (not used here, but supported by the resolver).
 * - Stocks (ls/ss) don’t use expiry; the resolver will ignore it.
 *
 * ONLY types & quantities are encoded here — no strikes, no premiums.
 */
const TEMPLATES = {
  /* 1 */  "long-call":            [ { type: "lc", qty: 1, expiry: "card" } ],
  /* 2 */  "short-put":            [ { type: "sp", qty: 1, expiry: "card" } ],
  /* 3 */  "protective-put":       [ { type: "ls", qty: 1 }, { type: "lp", qty: 1, expiry: "card" } ],

  /* 4 */  "bull-call-spread":     [ { type: "lc", qty: 1, expiry: "card" }, { type: "sc", qty: 1, expiry: "card" } ],
  /* 5 */  "bear-put-spread":      [ { type: "lp", qty: 1, expiry: "card" }, { type: "sp", qty: 1, expiry: "card" } ],

  /* 6 */  "long-strangle":        [ { type: "lc", qty: 1, expiry: "card" }, { type: "lp", qty: 1, expiry: "card" } ],
  /* 7 */  "put-calendar":         [ { type: "sp", qty: 1, expiry: "card" }, { type: "lp", qty: 1, expiry: "card+30" } ],

  /* 8 */  "iron-butterfly":       [ { type: "sc", qty: 1, expiry: "card" }, { type: "sp", qty: 1, expiry: "card" },
                                     { type: "lc", qty: 1, expiry: "card" }, { type: "lp", qty: 1, expiry: "card" } ],

  /* 9 */  "strap":                [ { type: "lc", qty: 2, expiry: "card" }, { type: "lp", qty: 1, expiry: "card" } ],
  /* 10 */ "call-ratio":           [ { type: "lc", qty: 1, expiry: "card" }, { type: "sc", qty: 2, expiry: "card" } ],
  /* 11 */ "put-backspread":       [ { type: "lp", qty: 2, expiry: "card" }, { type: "sp", qty: 1, expiry: "card" } ],
  /* 12 */ "reversal":             [ { type: "ss", qty: 1 }, { type: "lc", qty: 1, expiry: "card" }, { type: "sp", qty: 1, expiry: "card" } ],

  /* 13 */ "long-put":             [ { type: "lp", qty: 1, expiry: "card" } ],
  /* 14 */ "covered-call":         [ { type: "ls", qty: 1 }, { type: "sc", qty: 1, expiry: "card" } ],
  /* 15 */ "collar":               [ { type: "ls", qty: 1 }, { type: "lp", qty: 1, expiry: "card" }, { type: "sc", qty: 1, expiry: "card" } ],

  /* 16 */ "bear-call-spread":     [ { type: "sc", qty: 1, expiry: "card" }, { type: "lc", qty: 1, expiry: "card" } ],
  /* 17 */ "long-straddle":        [ { type: "lc", qty: 1, expiry: "card" }, { type: "lp", qty: 1, expiry: "card" } ],
  /* 18 */ "short-strangle":       [ { type: "sc", qty: 1, expiry: "card" }, { type: "sp", qty: 1, expiry: "card" } ],

  /* 19 */ "iron-condor":          [ { type: "sc", qty: 1, expiry: "card" }, { type: "sp", qty: 1, expiry: "card" },
                                     { type: "lc", qty: 1, expiry: "card" }, { type: "lp", qty: 1, expiry: "card" } ],

  /* 20 */ "reverse-butterfly":    [ { type: "sc", qty: 2, expiry: "card" }, { type: "lc", qty: 2, expiry: "card" } ],
                                   // Generic short butterfly (call-based). If you later split call/put variants, we’ll add separate IDs.

  /* 21 */ "call-diagonal":        [ { type: "sc", qty: 1, expiry: "card" }, { type: "lc", qty: 1, expiry: "card+30" } ],
  /* 22 */ "put-ratio":            [ { type: "lp", qty: 1, expiry: "card" }, { type: "sp", qty: 2, expiry: "card" } ],

  /* 23 */ "long-box":             [ { type: "lc", qty: 1, expiry: "card" }, { type: "sc", qty: 1, expiry: "card" },
                                     { type: "lp", qty: 1, expiry: "card" }, { type: "sp", qty: 1, expiry: "card" } ],

  /* 24 */ "stock-repair":         [ { type: "ls", qty: 1 }, { type: "lc", qty: 1, expiry: "card" }, { type: "sc", qty: 2, expiry: "card" } ],

  /* 25 */ "short-call":           [ { type: "sc", qty: 1, expiry: "card" } ],
  /* 26 */ "covered-put":          [ { type: "ss", qty: 1 }, { type: "lp", qty: 1, expiry: "card" } ],
  /* 27 */ "leaps":                [ { type: "lc", qty: 1, expiry: "card" } ], // uses card Time; change later if you want a hard minimum (e.g., 365d)

  /* 28 */ "bull-put-spread":      [ { type: "sp", qty: 1, expiry: "card" }, { type: "lp", qty: 1, expiry: "card" } ],
  /* 29 */ "short-straddle":       [ { type: "sc", qty: 1, expiry: "card" }, { type: "sp", qty: 1, expiry: "card" } ],

  /* 30 */ "call-calendar":        [ { type: "sc", qty: 1, expiry: "card" }, { type: "lc", qty: 1, expiry: "card+30" } ],
  /* 31 */ "reverse-condor":       [ { type: "lc", qty: 1, expiry: "card" }, { type: "lp", qty: 1, expiry: "card" },
                                     { type: "sc", qty: 1, expiry: "card" }, { type: "sp", qty: 1, expiry: "card" } ],

  /* 32 */ "call-butterfly":       [ { type: "lc", qty: 1, expiry: "card" }, { type: "sc", qty: 2, expiry: "card" }, { type: "lc", qty: 1, expiry: "card" } ],
  /* 33 */ "put-diagonal":         [ { type: "sp", qty: 1, expiry: "card" }, { type: "lp", qty: 1, expiry: "card+30" } ],
  /* 34 */ "call-backspread":      [ { type: "lc", qty: 2, expiry: "card" }, { type: "sc", qty: 1, expiry: "card" } ],

  /* 35 */ "short-box":            [ { type: "lc", qty: 1, expiry: "card" }, { type: "sc", qty: 1, expiry: "card" },
                                     { type: "lp", qty: 1, expiry: "card" }, { type: "sp", qty: 1, expiry: "card" } ],
};

// Convenience named export + default export
export const STRATEGY_TEMPLATES = TEMPLATES;
export const VALID_LEG_TYPES = ["lc", "sc", "lp", "sp", "ls", "ss"];

export default TEMPLATES;
