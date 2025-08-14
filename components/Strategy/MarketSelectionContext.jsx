"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

// Notes (LaTeX, reference):
// • \mathrm{ERP} = E(R_m) - r_f
// • \mu_{\text{CAPM}} = r_f + \beta \cdot \mathrm{ERP} - q
// • Basis: annual (decimal per year) throughout this context.

const MarketSelectionContext = createContext(null);

const defaultBenchmarkByIndexKey = {
  SPX: "^GSPC",
  STOXX: "^STOXX",
  NDX: "^NDX",
};

function inferCurrencyFromIndexKey(k) {
  return k === "STOXX" ? "EUR" : "USD";
}

/**
 * Provider to share selection + computed values across Strategy cards.
 * initial?: optional object to preseed fields (indexKey, lookback, currency, benchmark, etc.)
 */
export function MarketSelectionProvider({ children, initial = {} }) {
  // Selections
  const [indexKey, setIndexKey] = useState(initial.indexKey ?? "STOXX");
  const [lookback, setLookback] = useState(initial.lookback ?? "2y");
  const [currency, setCurrency] = useState(
    initial.currency ?? inferCurrencyFromIndexKey(initial.indexKey ?? "STOXX")
  );
  const [benchmark, setBenchmark] = useState(
    initial.benchmark ?? defaultBenchmarkByIndexKey[initial.indexKey ?? "STOXX"]
  );

  // Live market numbers (annual decimals)
  const [riskFree, setRiskFree] = useState(initial.riskFree ?? null); // r_f
  const [mrp, setMrp] = useState(initial.mrp ?? null);                 // ERP
  const [indexAnn, setIndexAnn] = useState(initial.indexAnn ?? null);  // E[R_m] = μ_geom

  // Company + drift controls
  const [beta, setBeta] = useState(initial.beta ?? null);
  const [dividendQ, setDividendQ] = useState(initial.dividendQ ?? 0);
  const [driftMode, setDriftMode] = useState(initial.driftMode ?? "CAPM"); // "CAPM" | "RF"

  // Convenience setter for the Market card to update all three at once.
  const setFromMarketStats = useCallback(({ riskFree, mrp, indexAnn }) => {
    if (typeof riskFree === "number") setRiskFree(riskFree);
    if (typeof mrp === "number") setMrp(mrp);
    if (typeof indexAnn === "number" || indexAnn === null) setIndexAnn(indexAnn);
  }, []);

  const value = useMemo(
    () => ({
      // selections
      indexKey, setIndexKey,
      lookback, setLookback,
      currency, setCurrency,
      benchmark, setBenchmark,

      // market numbers (annual)
      riskFree, mrp, indexAnn,
      setFromMarketStats,

      // company / drift
      beta, setBeta,
      dividendQ, setDividendQ,
      driftMode, setDriftMode,
    }),
    [
      indexKey, lookback, currency, benchmark,
      riskFree, mrp, indexAnn,
      beta, dividendQ, driftMode, setFromMarketStats
    ]
  );

  return (
    <MarketSelectionContext.Provider value={value}>
      {children}
    </MarketSelectionContext.Provider>
  );
}

export function useMarketSelection() {
  const ctx = useContext(MarketSelectionContext);
  if (!ctx) {
    throw new Error("useMarketSelection must be used within <MarketSelectionProvider>");
  }
  return ctx;
}
