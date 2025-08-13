// components/Strategy/TickerSearchUnified.jsx
"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

/**
 * Canonical ticker/company search input (desktop).
 *
 * Props:
 *  - value: string                          // controlled input value (optional)
 *  - defaultValue: string                   // uncontrolled initial value (optional)
 *  - onChange: (value: string) => void
 *  - onQueryChange: (q: string) => void     // called debounced (350ms)
 *  - items: Array<any>                      // suggestions to render
 *  - onSelect: (item: any) => void
 *  - busy: boolean                          // show spinner
 *  - placeholder?: string
 *  - getKey?: (item) => string              // default: item.symbol || item.ticker || item.id
 *  - itemToString?: (item) => string        // default: `${symbol} — ${name}`
 *  - renderItem?: (item, active) => ReactNode
 *  - className?: string
 *
 * Notes:
 *  - Visuals match your pill/seg/gear system (Apple-ish).
 *  - No API calls inside; parent owns fetching and passes `items`.
 */

export default function TickerSearchUnified({
  value,
  defaultValue = "",
  onChange,
  onQueryChange,
  items = [],
  onSelect,
  busy = false,
  placeholder = "Search company or ticker",
  getKey,
  itemToString,
  renderItem,
  className = "",
}) {
  const inputId = useId();
  const listId = useId();

  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const [uncontrolled, setUncontrolled] = useState(defaultValue);
  const val = value !== undefined ? value : uncontrolled;

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const kf = useMemo(
    () =>
      getKey ||
      ((it) =>
        String(
          it?.symbol ?? it?.ticker ?? it?.id ?? it?.value ?? it?.name ?? JSON.stringify(it)
        )),
    [getKey]
  );

  const strf = useMemo(
    () =>
      itemToString ||
      ((it) => {
        const sym = it?.symbol ?? it?.ticker ?? "";
        const nm = it?.name ?? it?.shortName ?? it?.longName ?? "";
        return sym && nm ? `${sym} — ${nm}` : sym || nm || "";
      }),
    [itemToString]
  );

  // --- Debounce calls to onQueryChange
  useEffect(() => {
    if (!onQueryChange) return;
    const h = setTimeout(() => onQueryChange(val.trim()), 350);
    return () => clearTimeout(h);
  }, [val, onQueryChange]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (!containerRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  // Keep activeIndex in range when items change
  useEffect(() => {
    if (!open) return;
    setActiveIndex((i) => {
      if (!Array.isArray(items) || items.length === 0) return -1;
      return Math.max(-1, Math.min(i, items.length - 1));
    });
  }, [items, open]);

  const setValue = (next) => {
    if (value !== undefined) {
      onChange?.(next);
    } else {
      setUncontrolled(next);
      onChange?.(next);
    }
  };

  const onKeyDown = (e) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!items.length) return;
      setActiveIndex((i) => (i < items.length - 1 ? i + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!items.length) return;
      setActiveIndex((i) => (i > 0 ? i - 1 : items.length - 1));
    } else if (e.key === "Enter") {
      if (open && activeIndex >= 0 && activeIndex < items.length) {
        e.preventDefault();
        const picked = items[activeIndex];
        onSelect?.(picked);
        setOpen(false);
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
      }
    }
  };

  const onInput = (e) => {
    const next = e.target.value;
    setValue(next);
    setOpen(true);
  };

  const hasValue = val && val.length > 0;

  return (
    <div
      ref={containerRef}
      className={`tsu ${className}`}
      role="combobox"
      aria-haspopup="listbox"
      aria-owns={listId}
      aria-expanded={open}
      aria-controls={listId}
    >
      {/* Input */}
      <div className="field">
        <div className="icon" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M20 20l-3.2-3.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </div>

        <input
          id={inputId}
          ref={inputRef}
          value={val}
          onChange={onInput}
          onKeyDown={onKeyDown}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-activedescendant={activeIndex >= 0 ? `${listId}-opt-${activeIndex}` : undefined}
        />

        {/* Clear */}
        {hasValue && (
          <button
            type="button"
            className="clear"
            onClick={() => {
              setValue("");
              inputRef.current?.focus();
              setOpen(false);
            }}
            aria-label="Clear"
            title="Clear"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        )}

        {/* Busy spinner */}
        <span className={`spin ${busy ? "is-on" : ""}`} aria-hidden="true" />
      </div>

      {/* Dropdown */}
      {open && (
        <div className="drop" role="listbox" id={listId}>
          {items.length === 0 ? (
            <div className="empty">No results</div>
          ) : (
            items.map((it, i) => {
              const active = i === activeIndex;
              return (
                <div
                  key={kf(it)}
                  id={`${listId}-opt-${i}`}
                  role="option"
                  aria-selected={active}
                  className={`row ${active ? "is-active" : ""}`}
                  onMouseEnter={() => setActiveIndex(i)}
                  onMouseDown={(e) => e.preventDefault()} // prevent input blur
                  onClick={() => {
                    onSelect?.(it);
                    setOpen(false);
                    inputRef.current?.blur();
                  }}
                >
                  {renderItem ? (
                    renderItem(it, active)
                  ) : (
                    <>
                      <div className="sym">{it?.symbol ?? it?.ticker ?? ""}</div>
                      <div className="name">
                        {it?.name ?? it?.shortName ?? it?.longName ?? strf(it)}
                        {it?.exchange ? <span className="xch"> • {it.exchange}</span> : null}
                        {it?.currency ? <span className="cur"> · {it.currency}</span> : null}
                      </div>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      <style jsx>{`
        .tsu { position: relative; width: 100%; max-width: 520px; }

        .field{
          position: relative;
          height: 38px;
          display: flex; align-items: center;
          border-radius: 14px;
          border: 1px solid var(--border);
          background: var(--card);
          color: var(--text);
          padding: 0 34px 0 34px;
        }
        .field:focus-within{
          box-shadow: 0 2px 12px rgba(0,0,0,.08);
        }

        .icon{
          position:absolute; left:10px; top:0; bottom:0;
          display:flex; align-items:center; opacity:.65;
        }

        input{
          width: 100%;
          height: 100%;
          border: 0; outline: none; background: transparent;
          color: var(--text);
          font-size: 14.5px; font-weight: 600;
        }
        input::placeholder{ color: color-mix(in srgb, var(--text) 55%, var(--card)); font-weight: 500; }

        .clear{
          position:absolute; right:28px; top:0; bottom:0;
          display:flex; align-items:center; justify-content:center;
          width: 18px; height: 100%;
          opacity: .65; border:0; background:transparent; color: var(--text);
          cursor: pointer;
        }
        .clear:hover{ opacity: .9; }

        .spin{
          position:absolute; right:8px; top:0; bottom:0;
          width: 18px; height: 18px; margin:auto 0;
          border-radius: 50%;
          border: 2px solid transparent;
          border-top-color: color-mix(in srgb, var(--text) 70%, var(--card));
          opacity: 0;
          animation: rot 0.9s linear infinite;
        }
        .spin.is-on{ opacity: .85; }

        @keyframes rot { to { transform: rotate(360deg); } }

        .drop{
          position: absolute; z-index: 40;
          left: 0; right: 0; top: calc(100% + 8px);
          border: 1px solid var(--border);
          border-radius: 14px;
          background: color-mix(in srgb, var(--card) 88%, transparent);
          -webkit-backdrop-filter: saturate(1.8) blur(10px);
          backdrop-filter: saturate(1.8) blur(10px);
          box-shadow: 0 12px 40px rgba(0,0,0,.10);
          padding: 6px;
        }

        .empty{
          padding: 10px 10px; border-radius: 10px;
          color: color-mix(in srgb, var(--text) 65%, var(--card));
          font-size: 13px; font-weight: 600; text-align: center;
        }

        .row{
          display:flex; align-items:center; gap:10px;
          height: 38px; padding: 0 10px; border-radius: 10px;
          cursor: pointer; user-select: none;
          color: var(--text);
        }
        .row:hover, .row.is-active{
          background: color-mix(in srgb, var(--text) 8%, transparent);
        }
        .sym{
          font-weight: 900; letter-spacing: .2px;
          min-width: 72px; text-align: left;
        }
        .name{
          font-weight: 600; opacity: .85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .xch, .cur{ opacity: .65; font-weight: 600; }
      `}</style>
    </div>
  );
}
