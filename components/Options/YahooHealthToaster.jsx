// components/Options/YahooHealthButton.jsx
"use client";

import { useEffect, useState, useCallback } from "react";

/**
 * Apple-style health button for Yahoo session.
 * - Blue (ok), Red (bad), neutral while checking/repairing.
 * - Click to repair when in "bad" state.
 * - Inner ring matches background (not tinted).
 * - NOW emits CustomEvents so YahooHealthToaster can react immediately.
 */
export default function YahooHealthButton() {
  const [state, setState] = useState("checking"); // checking | ok | bad | repairing

  const emit = (next) => {
    try {
      window.dispatchEvent(new CustomEvent("yahoo-health", { detail: { state: next } }));
    } catch { /* no-op */ }
  };

  const check = useCallback(async () => {
    try {
      setState((s) => {
        const next = s === "repairing" ? s : "checking";
        if (next !== s) emit(next);
        return next;
      });

      const r = await fetch("/api/yahoo/session", { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      const healthy = !!(j?.data?.ok && j?.data?.hasCookie);

      const next = healthy ? "ok" : "bad";
      setState(next);
      emit(next);
    } catch {
      setState("bad");
      emit("bad");
    }
  }, []);

  const repair = useCallback(async () => {
    try {
      setState("repairing");
      emit("repairing");
      await fetch("/api/yahoo/session", { method: "POST" });
    } catch {
      // ignore; we'll re-check below
    } finally {
      await check();
    }
  }, [check]);

  useEffect(() => {
    check();
    const id = setInterval(check, 10 * 60 * 1000);
    return () => clearInterval(id);
  }, [check]);

  const cls =
    "yhb " +
    (state === "ok"
      ? "is-ok"
      : state === "bad"
      ? "is-bad"
      : state === "repairing"
      ? "is-repairing"
      : "is-checking");

  const aria =
    state === "ok"
      ? "Yahoo connection healthy"
      : state === "bad"
      ? "Yahoo connection needs repair"
      : state === "repairing"
      ? "Repairing Yahoo connection"
      : "Checking Yahoo connection";

  return (
    <>
      <button
        type="button"
        className={cls}
        aria-label={aria}
        title={state === "ok" ? "Yahoo OK" : state === "bad" ? "Repair Yahoo" : "Checking Yahoo"}
        onClick={state === "bad" ? repair : undefined}
        disabled={state === "checking" || state === "repairing" || state === "ok"}
      >
        {/* Minimal shield/check icon */}
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 2.2l7 3v6.1c0 5-3.8 9.2-7 10.9C8.8 20.5 5 16.3 5 11.3V5.2l7-3z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M8.8 12.3l2.3 2.3l4.1-4.1"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        {/* Spinner for checking/repairing */}
        <span className="spin" aria-hidden="true" />
      </button>

      <style jsx>{`
        .yhb {
          position: relative;
          height: 38px;
          width: 42px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 14px;
          border: 1px solid var(--border);
          background: var(--card);
          color: var(--text);
          transition: border-color 0.18s ease, box-shadow 0.18s ease, color 0.18s ease, opacity 0.18s ease;
          outline: none;
        }

        /* Inner ring → match background (no tint) */
        .yhb::after {
          content: "";
          position: absolute;
          inset: 6px;
          border-radius: 10px;
          border: 2px solid var(--card); /* background color, not currentColor */
          opacity: 1;
          pointer-events: none;
          transition: opacity 0.18s ease;
        }

        .yhb:hover {
          box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
        }

        /* State colors affect only outer border + icon */
        .yhb.is-ok {
          border-color: color-mix(in srgb, var(--accent, #3b82f6) 60%, var(--border));
          color: var(--accent, #3b82f6);
        }
        .yhb.is-bad {
          border-color: color-mix(in srgb, #ef4444 70%, var(--border));
          color: #ef4444;
        }
        .yhb.is-checking,
        .yhb.is-repairing {
          color: color-mix(in srgb, var(--text) 65%, var(--card));
        }

        .yhb.is-checking .spin,
        .yhb.is-repairing .spin {
          opacity: 1;
        }

        .spin {
          position: absolute;
          inset: 5px;
          border-radius: 12px;
          border: 2px solid transparent;
          border-top-color: currentColor;
          opacity: 0;
          transition: opacity 0.12s ease;
          animation: yhb-spin 0.9s linear infinite;
        }

        @keyframes yhb-spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </>
  );
}
