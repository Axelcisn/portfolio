// components/ui/TabsNav.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * TabsNav
 * Props:
 *  - tabs: [{ key: "overview", label: "Overview" }, ...]
 *  - activeKey: string
 *  - onChange: (key) => void
 *  - className?: string
 */
export default function TabsNav({ tabs = [], activeKey, onChange, className = "" }) {
  const wrapRef = useRef(null);
  const btnRefs = useRef(Object.create(null));
  const [bar, setBar] = useState({ left: 0, width: 0 });

  const keys = useMemo(() => tabs.map(t => t.key), [tabs]);
  useEffect(() => {
    for (const k of keys) if (!btnRefs.current[k]) btnRefs.current[k] = { el: null };
  }, [keys]);

  const updateBar = () => {
    try {
      const host = wrapRef.current;
      const btn = btnRefs.current[activeKey]?.el;
      if (!host || !btn) return;
      const hr = host.getBoundingClientRect?.();
      const br = btn.getBoundingClientRect?.();
      if (!hr || !br) return;
      setBar({
        left: br.left - hr.left + (host.scrollLeft || 0),
        width: br.width || 0,
      });
    } catch {
      /* no-op */
    }
  };

  useEffect(() => {
    // Run after paint
    const raf = typeof window !== "undefined" && window.requestAnimationFrame
      ? window.requestAnimationFrame
      : (fn) => setTimeout(fn, 0);
    raf(updateBar);

    // Guarded ResizeObserver (some environments don’t have it)
    const RO = typeof window !== "undefined" && "ResizeObserver" in window
      ? window.ResizeObserver
      : null;

    let ro = null;
    if (RO && wrapRef.current) {
      ro = new RO(() => updateBar());
      try { ro.observe(wrapRef.current); } catch { /* ignore */ }
    }

    const onResize = () => updateBar();
    if (typeof window !== "undefined") window.addEventListener("resize", onResize);

    return () => {
      if (ro) try { ro.disconnect(); } catch { /* ignore */ }
      if (typeof window !== "undefined") window.removeEventListener("resize", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, tabs.length]);

  const onKeyDown = (e, idx) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const dir = e.key === "ArrowRight" ? 1 : -1;
    const next = (idx + dir + tabs.length) % tabs.length;
    onChange?.(tabs[next].key);
    btnRefs.current[tabs[next].key]?.el?.focus?.();
  };

  return (
    <div className={`tabs-wrap ${className}`} role="tablist" aria-label="Sections" ref={wrapRef}>
      {tabs.map((t, i) => {
        const active = t.key === activeKey;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={active}
            aria-controls={`panel-${t.key}`}
            id={`tab-${t.key}`}
            className={`tab-btn ${active ? "is-active" : ""}`}
            onClick={() => onChange?.(t.key)}
            onKeyDown={(e) => onKeyDown(e, i)}
            ref={(el) => (btnRefs.current[t.key].el = el)}
            type="button"
          >
            {t.label}
          </button>
        );
      })}
      <div
        className="accent"
        style={{ transform: `translateX(${bar.left}px)`, width: `${bar.width}px` }}
        aria-hidden="true"
      />
      <style jsx>{`
        .tabs-wrap {
          position: relative;
          display: flex;
          gap: 2px;
          border-bottom: 1px solid var(--border);
          overflow-x: auto;
          scrollbar-width: none;
          -ms-overflow-style: none;
          padding: 0 4px;
        }
        .tabs-wrap::-webkit-scrollbar { display: none; }

        .tab-btn {
          position: relative;
          flex: 0 0 auto;
          height: 40px;
          padding: 0 14px;
          border: 0;
          background: transparent;
          color: var(--text);
          opacity: 0.8;
          font-weight: 700;
          border-radius: 8px 8px 0 0;
          cursor: pointer;
        }
        .tab-btn:hover { background: var(--card); opacity: 1; }
        .tab-btn.is-active { opacity: 1; }

        .tab-btn:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px var(--accent, #3b82f6);
        }

        .accent {
          position: absolute;
          height: 2px;
          left: 0;
          bottom: -1px;
          background: var(--accent, #3b82f6);
          border-radius: 2px;
          transition: transform 180ms ease, width 180ms ease;
          will-change: transform, width;
        }
      `}</style>
    </div>
  );
}
