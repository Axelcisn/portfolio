// components/Strategy/CompanySearch.jsx
"use client";

import { useEffect, useRef, useState } from "react";
import TickerSearchUnified from "./TickerSearchUnified";

/**
 * Adapter over the canonical TickerSearchUnified (desktop).
 *
 * Props (compat):
 *  - value?: string
 *  - onSelect?: (item: {ticker, name, exchange, currency}) => void
 *  - placeholder?: string
 *  - maxItems?: number
 *
 * Notes:
 *  - Keeps Apple-style visuals from the unified component.
 *  - Cancel-safe lookups; slices to maxItems.
 */
export default function CompanySearch({
  value = "",
  onSelect = () => {},
  placeholder = "Search ticker or company…",
  maxItems = 12,
}) {
  const [q, setQ] = useState(value || "");
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);

  // Keep q in sync with external value
  useEffect(() => { setQ(value || ""); }, [value]);

  // Cancel in-flight searches
  const abortRef = useRef(null);

  async function fetchSuggestions(term) {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      setBusy(true);
      const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`, {
        cache: "no-store",
        signal: ctrl.signal,
      });
      const j = await r.json().catch(() => ({}));

      const raw =
        Array.isArray(j) ? j
        : j?.quotes ?? j?.results ?? j?.data ?? [];

      const mapped = (raw || [])
        .filter((it) => it && (it.symbol || it.ticker || it.id))
        .slice(0, Math.max(1, Number(maxItems) || 12))
        .map((it) => ({
          symbol: it.symbol ?? it.ticker ?? it.id ?? "",
          name:
            it.shortname ??
            it.shortName ??
            it.longname ??
            it.longName ??
            it.name ??
            "",
          exchange:
            it.exchDisp ??
            it.exchange ??
            it.exch ??
            (it.market || ""),
          currency: it.currency ?? "",
        }));

      setItems(mapped);
    } catch {
      setItems([]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <TickerSearchUnified
      value={q}
      onChange={(next) => setQ(next)}
      placeholder={placeholder}
      items={items}
      busy={busy}
      // Unified internally debounces the query (≈350ms)
      onQueryChange={(term) => {
        const t = (term || "").trim();
        if (!t) {
          if (abortRef.current) abortRef.current.abort();
          setItems([]);
          setBusy(false);
          return;
        }
        fetchSuggestions(t);
      }}
      onSelect={(it) => {
        // Preserve the legacy payload shape expected by callers
        onSelect({
          ticker: it?.symbol || "",
          name: it?.name || "",
          exchange: it?.exchange || "",
          currency: it?.currency || "",
        });
        setQ(it?.symbol || "");
      }}
    />
  );
}
