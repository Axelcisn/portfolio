// components/Company/CompanyCurrencyBridge.jsx
"use client";

/**
 * CompanyCurrencyBridge
 * ------------------------------------------------------------
 * Purpose:
 *  - Watch the last picked symbol (localStorage.company.lastSymbol)
 *  - Fetch /api/company?symbol=... to derive `currency`
 *  - Persist currency -> localStorage.company.lastCurrency
 *  - Broadcast window CustomEvent('company-currency', { symbol, currency })
 *
 * Drop-in:
 *  - Mount once on any desktop page that shows the Company Card + Options.
 *  - No UI, no style changes. Safe to include globally.
 *
 * Notes:
 *  - Works even if the symbol is updated in the same tab (light polling)
 *    and across tabs (storage events).
 *  - Next step can wire consumers (e.g., OptionsTab) to read the event
 *    or from localStorage for instant currency awareness.
 */

import { useEffect, useRef } from "react";

export default function CompanyCurrencyBridge() {
  const lastSymbolRef = useRef("");
  const inflightRef = useRef(false);

  // Read helpers
  const readSymbol = () => {
    try { return localStorage.getItem("company.lastSymbol") || ""; }
    catch { return ""; }
  };
  const readCurrency = () => {
    try { return localStorage.getItem("company.lastCurrency") || ""; }
    catch { return ""; }
  };
  const writeCurrency = (cur) => {
    try { localStorage.setItem("company.lastCurrency", cur || ""); } catch {}
  };
  const emit = (symbol, currency) => {
    try { window.dispatchEvent(new CustomEvent("company-currency", { detail: { symbol, currency } })); } catch {}
  };

  const fetchCurrency = async (symbol) => {
    if (!symbol || inflightRef.current) return;
    inflightRef.current = true;
    try {
      const r = await fetch(`/api/company?symbol=${encodeURIComponent(symbol)}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      const currency = (j && j.currency) ? String(j.currency) : "";
      if (currency && currency !== readCurrency()) {
        writeCurrency(currency);
        emit(symbol, currency);
      } else if (currency) {
        // still emit so live listeners update immediately
        emit(symbol, currency);
      }
    } catch {
      // silent fail; will retry on next tick/update
    } finally {
      inflightRef.current = false;
    }
  };

  useEffect(() => {
    // Initial kick
    const sym0 = readSymbol();
    lastSymbolRef.current = sym0;
    if (sym0) {
      // Prefer idle when available to avoid blocking paint
      if (typeof window !== "undefined" && "requestIdleCallback" in window) {
        window.requestIdleCallback(() => fetchCurrency(sym0), { timeout: 800 });
      } else {
        setTimeout(() => fetchCurrency(sym0), 0);
      }
    }

    // Same-tab light polling for quick picks (since storage doesn't fire in same tab)
    const poll = setInterval(() => {
      const cur = readSymbol();
      if (cur && cur !== lastSymbolRef.current) {
        lastSymbolRef.current = cur;
        fetchCurrency(cur);
      }
    }, 1200);

    // Cross-tab sync + visibility refresh
    const onStorage = (e) => {
      if (e.key === "company.lastSymbol") {
        const next = e.newValue || "";
        if (next && next !== lastSymbolRef.current) {
          lastSymbolRef.current = next;
          fetchCurrency(next);
        }
      }
    };
    const onVis = () => {
      if (document.visibilityState === "visible") {
        const cur = readSymbol();
        if (cur && cur !== lastSymbolRef.current) {
          lastSymbolRef.current = cur;
          fetchCurrency(cur);
        }
      }
    };

    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      clearInterval(poll);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return null; // No UI
}
