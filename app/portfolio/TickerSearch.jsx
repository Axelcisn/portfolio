"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export default function TickerSearch({
  value,
  onChange,
  onPick,
  placeholder = "Search by name or ticker…",
  minLength = 1,
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [opts, setOpts] = useState([]);
  const [active, setActive] = useState(0);
  const acRef = useRef(null);
  const boxRef = useRef(null);

  const q = value ?? "";

  const debouncedFetch = useMemo(() => {
    let t;
    return (fn, delay = 180) => {
      clearTimeout(t);
      t = setTimeout(fn, delay);
    };
  }, []);

  useEffect(() => {
    if (q.trim().length < minLength) {
      setOpts([]);
      setOpen(false);
      return;
    }
    debouncedFetch(async () => {
      try {
        acRef.current?.abort();
      } catch {}
      const ac = new AbortController();
      acRef.current = ac;
      setLoading(true);
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
        signal: ac.signal,
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({ results: [] }));
      const rows = Array.isArray(data?.results) ? data.results : [];
      // Normalize diverse Yahoo payloads
      const mapped = rows.map((r) => ({
        symbol: r.symbol || r.ticker || r.code || "",
        name:
          r.shortname ||
          r.longname ||
          r.name ||
          r.description ||
          r.quoteType ||
          "",
        exch: r.exchDisp || r.exchange || r.exchangeDisplay || r.exch || "",
        type: r.typeDisp || r.type || "",
      }));
      setOpts(mapped.slice(0, 8));
      setOpen(true);
      setActive(0);
    }).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => {
    const onDoc = (e) => {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("click", onDoc, true);
    return () => document.removeEventListener("click", onDoc, true);
  }, []);

  function pick(i) {
    const item = opts[i];
    if (!item) return;
    onPick?.(item);
    setOpen(false);
  }

  function onKeyDown(e) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((p) => (p + 1) % Math.max(1, opts.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((p) => (p - 1 + Math.max(1, opts.length)) % Math.max(1, opts.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && opts.length) pick(active);
      else if (q.trim()) onPick?.({ symbol: q.trim() });
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative" ref={boxRef}>
      <input
        className="w-full rounded-xl bg-[#17171b] border border-[#2c2c2e] px-4 py-3 text-white outline-none focus:ring-2 focus:ring-[#007aff]"
        placeholder={placeholder}
        value={q}
        onChange={(e) => onChange?.(e.target.value)}
        onFocus={() => q.trim().length >= minLength && setOpen(true)}
        onKeyDown={onKeyDown}
        autoCapitalize="characters"
        spellCheck={false}
      />
      {open && (
        <div className="absolute z-20 mt-2 w-full rounded-xl border border-[#2c2c2e] bg-[#0b0b0f] shadow-xl">
          {loading && (
            <div className="px-4 py-3 text-sm text-neutral-400">Searching…</div>
          )}
          {!loading && opts.length === 0 && (
            <div className="px-4 py-3 text-sm text-neutral-400">
              No matches. Press Enter to try “{q}”.
            </div>
          )}
          {!loading &&
            opts.map((o, i) => (
              <button
                key={`${o.symbol}-${i}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(i)}
                className={`flex w-full items-center justify-between px-4 py-2 text-left ${i === active ? "bg-[#1a1a1f]" : ""}`}
              >
                <div className="flex min-w-0 flex-col">
                  <div className="truncate text-sm text-white">
                    <span className="font-semibold">{o.symbol}</span>
                    {o.name ? <span className="text-neutral-400"> — {o.name}</span> : null}
                  </div>
                  <div className="truncate text-xs text-neutral-500">
                    {[o.type, o.exch].filter(Boolean).join(" • ")}
                  </div>
                </div>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
