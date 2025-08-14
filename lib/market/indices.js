// lib/market/indices.js
// Unified index catalog + helpers (client & server safe)

/**
 * Canonical index definitions:
 *  - key: short UI code
 *  - symbol: Yahoo Finance canonical symbol
 *  - label: UI label
 *  - currency: reporting currency used for that index
 */
export const INDEX_DEFS = [
  { key: "SPX",    symbol: "^GSPC",   label: "S&P 500 (SPX)",             currency: "USD" },
  { key: "NDX",    symbol: "^NDX",    label: "NASDAQ 100 (NDX)",          currency: "USD" },
  { key: "DJI",    symbol: "^DJI",    label: "Dow Jones (DJI)",           currency: "USD" },
  { key: "RUT",    symbol: "^RUT",    label: "Russell 2000 (RUT)",        currency: "USD" },
  { key: "STOXX",  symbol: "^STOXX",  label: "STOXX Europe 600 (STOXX)",  currency: "EUR" },
  { key: "SX5E",   symbol: "^SX5E",   label: "EURO STOXX 50 (SX5E)",      currency: "EUR" },
  { key: "FTSE",   symbol: "^FTSE",   label: "FTSE 100 (FTSE)",           currency: "GBP" },
  { key: "N225",   symbol: "^N225",   label: "Nikkei 225 (N225)",         currency: "JPY" },
  { key: "SSMI",   symbol: "^SSMI",   label: "SMI Switzerland (SSMI)",    currency: "CHF" },
  { key: "GSPTSE", symbol: "^GSPTSE", label: "TSX Composite (GSPTSE)",    currency: "CAD" },
];

/** UI-friendly list (key + label only). */
export const INDICES = INDEX_DEFS.map(({ key, label }) => ({ key, label }));

/** Quick lookups */
const byKey    = new Map(INDEX_DEFS.map(d => [d.key.toUpperCase(), d]));
const bySymbol = new Map(INDEX_DEFS.map(d => [d.symbol.toUpperCase(), d]));

/** Alias map → canonical Yahoo symbol */
const ALIAS = new Map([
  // S&P 500
  ["SPX", "^GSPC"], ["^SPX", "^GSPC"], ["S&P500", "^GSPC"], ["S&P 500", "^GSPC"], ["GSPC", "^GSPC"], ["^GSPC", "^GSPC"],
  // NASDAQ 100
  ["NDX", "^NDX"], ["^NDX", "^NDX"],
  // Dow Jones
  ["DJI", "^DJI"], ["^DJI", "^DJI"],
  // Russell 2000
  ["RUT", "^RUT"], ["^RUT", "^RUT"],
  // STOXX 600
  ["STOXX", "^STOXX"], ["^STOXX", "^STOXX"],
  // EURO STOXX 50
  ["EUROSTOXX50", "^SX5E"], ["ESTX50", "^SX5E"], ["SX5E", "^SX5E"], ["^SX5E", "^SX5E"],
  // FTSE 100
  ["FTSE", "^FTSE"], ["^FTSE", "^FTSE"],
  // Nikkei 225
  ["N225", "^N225"], ["^N225", "^N225"], ["NIKKEI", "^N225"],
  // Swiss SMI
  ["SMI", "^SSMI"], ["SSMI", "^SSMI"], ["^SSMI", "^SSMI"],
  // TSX Composite
  ["TSX", "^GSPTSE"], ["GSPTSE", "^GSPTSE"], ["^GSPTSE", "^GSPTSE"],
]);

/**
 * normalizeIndex(ix): returns a canonical Yahoo symbol (e.g., "^GSPC").
 * Accepts UI key ("SPX"), alias ("S&P500"), or already-caret symbol.
 */
export function normalizeIndex(ix) {
  const q = String(ix || "SPX").trim().toUpperCase();
  // direct by key
  if (byKey.has(q)) return byKey.get(q).symbol;
  // alias table
  if (ALIAS.has(q)) return ALIAS.get(q);
  // already canonical?
  if (bySymbol.has(q)) return q;
  // permissive fallback: if it already starts with ^, keep it; else prefix ^
  return q.startsWith("^") ? q : `^${q}`;
}

/**
 * currencyByIndex(ix): returns ISO currency for the provided index key/symbol.
 * Falls back to "USD" if unknown.
 */
export function currencyByIndex(ix) {
  const sym = normalizeIndex(ix).toUpperCase();
  const hit = bySymbol.get(sym);
  return hit?.currency || "USD";
}

/** Optional: label by key (used by some UIs) */
export function labelByKey(key) {
  const hit = byKey.get(String(key || "").toUpperCase());
  return hit?.label || String(key || "");
}
