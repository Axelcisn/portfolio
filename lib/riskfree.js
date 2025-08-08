import { yahooQuote } from "./yahoo.js";

// EUR: pull €STR (latest) from ECB; fallback to 2.0%
// USD: use 13W T-bill (^IRX) via Yahoo; interpret as percent then /100
export async function riskFreeByCcy(ccy) {
  try {
    if (ccy === "EUR") {
      const u = "https://data-api.ecb.europa.eu/service/data/EST/EST.B.EU000A2X2A25.WT?lastNObservations=1&detail=dataonly&format=jsondata";
      const res = await fetch(u, { cache: "no-store" });
      if (res.ok) {
        const j = await res.json();
        const obs = j?.data?.[0]?.observations?.[0]?.value ?? j?.dataSets?.[0]?.series?.["0:0:0:0:0"]?.observations;
        // SDMX JSON can vary; attempt robust dig:
        let val = null;
        if (Array.isArray(obs)) {
          const last = obs[obs.length - 1]?.[0];
          val = Number(last);
        } else if (typeof obs === "object" && obs) {
          const firstKey = Object.keys(obs)[0];
          val = Number(obs[firstKey]?.[0]);
        }
        if (Number.isFinite(val)) return { r: val / 100, source: "ECB €STR" }; // ECB publishes as % value
      }
      return { r: 0.02, source: "fallback" };
    }
    if (ccy === "USD") {
      const q = await yahooQuote("^IRX");  // 13-week T-bill yield
      const pct = Number(q?.spot);         // comes as percent (e.g., 5.25)
      if (Number.isFinite(pct)) return { r: pct / 100, source: "^IRX (Yahoo)" };
      return { r: 0.03, source: "fallback" };
    }
    // Other currencies -> conservative fallback
    return { r: 0.03, source: "fallback" };
  } catch {
    return { r: 0.03, source: "fallback" };
  }
}
