// lib/volatility.js
// Standalone helpers for annualized volatility.
// - Live IV via Yahoo options chain
// - Historical vol from daily closes (trailing N days)

import { yahooLiveIv, yahooDailyCloses } from "./yahoo.js";
import { logReturns, annualizedFromDailyLogs } from "./stats.js";

function n(x) { const v = Number(x); return Number.isFinite(v) ? v : null; }

/** Live implied volatility (decimal), null if unavailable */
export async function getLiveIV(symbol, spotHint = null) {
  try {
    const sym = String(symbol || "").trim().toUpperCase();
    if (!sym) throw new Error("symbol required");
    // spotHint is optional; yahooLiveIv handles null
    const iv = await yahooLiveIv(sym, n(spotHint));
    return n(iv);
  } catch {
    return null;
  }
}

/** Historical realized volatility (decimal) for trailing N days (>=5) */
export async function getHistVol(symbol, days = 30) {
  const sym = String(symbol || "").trim().toUpperCase();
  if (!sym) throw new Error("symbol required");
  const win = Math.max(5, Math.floor(Number(days) || 30));

  const bars = await yahooDailyCloses(sym, "1y", "1d"); // [{t, close}]
  const closes = bars.map(b => b.close).filter(v => Number.isFinite(v));
  if (closes.length < win + 1) return null;

  const windowed = closes.slice(-win);
  const rets = logReturns(windowed);
  const { volA } = annualizedFromDailyLogs(rets);
  return n(volA);
}
