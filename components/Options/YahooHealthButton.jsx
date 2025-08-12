// components/Options/YahooHealthButton.jsx
"use client";

import { useEffect, useState, useCallback } from "react";

/**
 * A compact, Apple-style health button for the Yahoo session.
 * States:
 *  - checking / repairing → subtle spinner
 *  - ok → blue
 *  - bad/error → red
 *
 * Click = attempt repair (POST /api/yahoo/repair), then re-check status.
 */
export default function YahooHealthButton() {
  const [state, setState] = useState("checking"); // checking | ok | bad | repairing

  const check = useCallback(async () => {
    try {
      setState((s) => (s === "repairing" ? s : "checking"));
      const r = await fetch("/api/yahoo/session", { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      setState(j?.ok ? "ok" : "bad");
    } catch {
      setState("bad");
    }
  }, []);

  const repair = useCallback(async () => {
    try {
      setState("repairing");
      await fetch("/api/yahoo/repair", { method: "POST" });
    } catch {
      // ignore
    } finally {
      await check();
    }
  }, [check]);

  useEffect(() => {
    check();
    // re-check every 10 minutes, keeps it light
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
        title={state === "ok" ? "Yahoo OK" : "Repair Yahoo"}
        onClick={state === "ok" || state === "checking" ? undefined : repair}
        disabled={state === "checking" || state === "repairing"}
      >
        {/* Minimal, premium-looking shield icon */}
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
        /* Base sizes mirror the gear for perfect harmony */
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

        /* Inner ring (premium, subtle) */
        .yhb::after {
          content: "";
          position: absolute;
          inset: 6px;
          border-radius: 10px;
          border: 2px solid currentColor;
          opacity: 0.18;
          pointer-events: none;
          transition: opacity 0.18s ease;
        }

        /* Hover affordance */
        .yhb:hover {
          box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
        }

        /* OK = blue accent */
        .yhb.is-ok {
          border-color: color-mix(in srgb, var(--accent, #3b82f6) 60%, var(--border));
          color: var(--accent, #3b82f6);
        }
        .yhb.is-ok::after {
          opacity: 0.26;
        }

        /* BAD = red (both outer & inner ring + icon) */
        .yhb.is-bad {
          border-color: color-mix(in srgb, #ef4444 70%, var(--border));
          color: #ef4444;
        }
        .yhb.is-bad::after {
          opacity: 0.32;
        }

        /* Checking / Repairing = neutral + spinner visible */
        .yhb.is-checking,
        .yhb.is-repairing {
          color: color-mix(in srgb, var(--text) 65%, var(--card));
        }
        .yhb.is-checking .spin,
        .yhb.is-repairing .spin {
          opacity: 1;
        }

        /* Hidden by default */
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
