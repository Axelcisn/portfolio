import { yahooQuote } from "./yahoo";

export async function riskFreeByCcy(ccy) {
  try {
    if (ccy === "EUR") {
      // EUR: ECB €STR data…
      // (existing code here)
    }
    if (ccy === "USD") {
      const q = await yahooQuote("^IRX");
      const pct = Number(q?.spot);
      if (Number.isFinite(pct)) return { r: pct / 100, source: "^IRX (Yahoo)" };
      return { r: 0.03, source: "fallback" };
    }
    return { r: 0.03, source: "fallback" };
  } catch {
    return { r: 0.03, source: "fallback" };
  }
}
