// components/Strategy/TickerSearch.jsx
"use client";

import { useEffect, useRef, useState } from "react";
import TickerSearchUnified from "./TickerSearchUnified";

/**
 * Adapter wrapper to preserve the old TickerSearch API while using the
 * canonical Apple-style UI from TickerSearchUnified.
 *
 * Props (compat):
 *  - value?: string
 *  - onPick?: (item) => void          // called when a suggestion is chosen
 *  - onEnter?: (query: string) => void // called when user presses Enter (no pick)
 *  - placeholder?: string
 */
export default function TickerSearch({
  value = "",
  onPick = () => {},
  onEnter = () => {},
  placeholder = "Type ticker or company…",
}) {
  const [q, setQ] = useState(value || "");
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);

  // Track whether a selection just happened to avoid double-calling onEnter
  const justSelectedRef = useRef(false);

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
    } catch (_e) {
      // silence (aborts/errors); show no results
      setItems([]);
    } finally {
      setBusy(false);
    }
  }

  return (
    // Capture Enter on the wrapper to support the legacy onEnter prop
    <div
      onKeyDownCapture={(e) => {
        if (e.key === "Enter") {
          // If a pick just occurred, skip this Enter callback once
          if (justSelectedRef.current) {
            // reset the flag for next keypress
            justSelectedRef.current = false;
            return;
          }
          onEnter(q.trim());
        }
      }}
    >
      <TickerSearchUnified
        value={q}
        onChange={(next) => setQ(next)}
        placeholder={placeholder}
        items={items}
        busy={busy}
        // Unified debounces this by 350ms
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
          justSelectedRef.current = true;
          setQ(it?.symbol || "");
          onPick(it);
        }}
      />
    </div>
  );
}
