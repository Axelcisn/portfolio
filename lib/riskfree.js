import { yahooQuote } from "./yahoo";

// Returns risk‑free rate by currency (decimal per year) and its source.
// EUR uses ECB €STR (fallback 2%), USD uses 13‑week T‑bill (^IRX).
export async function riskFreeByCcy(ccy) {
  try {
    if (ccy === "EUR") {
      const u =
        "https://data-api.ecb.europa.eu/service/data/EST/EST.B.EU000A2X2A25.WT?lastNObservations=1&detail=dataonly&format=jsondata";
      try {
        const res = await fetch(u);
        if (res.ok) {
          const j = await res.json();
          // attempt to extract the latest value; dataset shape may vary
          let val = null;
          const obs =
            j?.data?.[0]?.observations?.[0]?.value ??
            j?.dataSets?.[0]?.series?.["0:0:0:0:0"]?.observations;
          if (Array.isArray(obs)) {
            const last = obs[obs.length - 1]?.[0];
            val = Number(last);
          } else if (typeof obs === "object" && obs) {
            const firstKey = Object.keys(obs)[0];
            val = Number(obs[firstKey]?.[0]);
          }
          if (Number.isFinite(val)) {
            return { r: val / 100, source: "ECB €STR" };
          }
        }
      } catch {
        /* ignore */
      }
      return { r: 0.02, source: "fallback" };
    }

    if (ccy === "USD") {
      const q = await yahooQuote("^IRX");
      const pct = Number(q?.spot);
      if (Number.isFinite(pct)) {
        return { r: pct / 100, source: "^IRX (Yahoo)" };
      }
      return { r: 0.03, source: "fallback" };
    }

    // other currencies → generic 3% fallback
    return { r: 0.03, source: "fallback" };
  } catch {
    return { r: 0.03, source: "fallback" };
  }
}
