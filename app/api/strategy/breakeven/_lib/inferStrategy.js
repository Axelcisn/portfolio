// app/api/strategy/breakeven/_lib/inferStrategy.js
// Infer a canonical strategy key from legs when client did not supply a known key.

const isOpt = (l) => l?.type === "call" || l?.type === "put";
const tolEq = (a, b) => Math.abs(Number(a) - Number(b)) <= 1e-8;

export function inferStrategy(legs = []) {
  const opts = (legs || []).filter(isOpt).filter(l => Number.isFinite(Number(l?.strike)));
  if (opts.length === 0) return null;

  const callsLong  = opts.filter(l => l.type === "call" && l.side === "long");
  const callsShort = opts.filter(l => l.type === "call" && l.side === "short");
  const putsLong   = opts.filter(l => l.type === "put"  && l.side === "long");
  const putsShort  = opts.filter(l => l.type === "put"  && l.side === "short");

  // Single-leg
  if (opts.length === 1) {
    const l = opts[0];
    if (l.type === "call") return l.side === "long" ? "long_call" : "short_call";
    if (l.type === "put")  return l.side === "long" ? "long_put"  : "short_put";
  }

  // Vertical spreads (two calls OR two puts, opposite sides)
  if (callsLong.length === 1 && callsShort.length === 1 && opts.length === 2) {
    const Kl = Number(callsLong[0].strike);
    const Ks = Number(callsShort[0].strike);
    return Kl < Ks ? "bull_call_spread" : "bear_call_spread";
  }
  if (putsLong.length === 1 && putsShort.length === 1 && opts.length === 2) {
    const Kl = Number(putsLong[0].strike);
    const Ks = Number(putsShort[0].strike);
    return Kl > Ks ? "bear_put_spread" : "bull_put_spread";
  }

  // Short straddle/strangle (2 shorts, one call + one put)
  if (callsShort.length === 1 && putsShort.length === 1 && opts.length === 2) {
    const Kc = Number(callsShort[0].strike);
    const Kp = Number(putsShort[0].strike);
    return tolEq(Kc, Kp) ? "short_straddle" : "short_strangle";
  }

  // Iron butterfly: short straddle + long wings
  const shortStraddleCore =
    callsShort.length === 1 && putsShort.length === 1 &&
    tolEq(callsShort[0].strike, putsShort[0].strike);
  const wings =
    (callsLong.length >= 1 && putsLong.length >= 1) &&
    Number(callsLong[0]?.strike) > Number(callsShort[0]?.strike) &&
    Number(putsLong[0]?.strike)  < Number(putsShort[0]?.strike);

  if (shortStraddleCore && wings) return "iron_butterfly";

  // Could add iron_condor, calendars, ratios as needed
  return null;
}
