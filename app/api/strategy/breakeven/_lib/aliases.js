// app/api/strategy/breakeven/_lib/aliases.js

export const STRAT_ALIASES = Object.freeze({
  // single legs
  longcall: "long_call",
  long_call: "long_call",
  shortcall: "short_call",
  short_call: "short_call",
  longput: "long_put",
  long_put: "long_put",
  shortput: "short_put",
  short_put: "short_put",

  // verticals
  bullcallspread: "bull_call_spread",
  bull_call_spread: "bull_call_spread",
  bearcallspread: "bear_call_spread",
  bear_call_spread: "bear_call_spread",
  bullputspread: "bull_put_spread",
  bull_put_spread: "bull_put_spread",
  bearputspread: "bear_put_spread",
  bear_put_spread: "bear_put_spread",

  // combos
  longstraddle: "long_straddle",
  long_straddle: "long_straddle",
  shortstraddle: "short_straddle",
  short_straddle: "short_straddle",
  longstrangle: "long_strangle",
  long_strangle: "long_strangle",
  shortstrangle: "short_strangle",
  short_strangle: "short_strangle",
  ironcondor: "iron_condor",
  iron_condor: "iron_condor",
  ironbutterfly: "iron_butterfly",
  iron_butterfly: "iron_butterfly",
  callratio: "call_ratio",
  call_ratio: "call_ratio",
  putratio: "put_ratio",
  put_ratio: "put_ratio",
  collar: "collar",
  callcalendar: "call_calendar",
  call_calendar: "call_calendar",
  putcalendar: "put_calendar",
  put_calendar: "put_calendar",
  longbox: "long_box",
  long_box: "long_box",
  shortbox: "short_box",
  short_box: "short_box",

  // marketing names
  leaps: "long_call",
});

export function normalizeStrategyKey(x) {
  if (!x) return null;
  const s = String(x).toLowerCase().replace(/\s+/g, "").replace(/-/g, "");
  return STRAT_ALIASES[s] ?? null;
}
