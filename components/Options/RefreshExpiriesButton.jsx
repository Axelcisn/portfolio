// components/Options/RefreshExpiriesButton.jsx
"use client";

import { useState } from "react";

export default function RefreshExpiriesButton({
  onRefresh,
  busy: busyProp = false,
  title = "Refresh expiries",
}) {
  const [busyLocal, setBusyLocal] = useState(false);
  const isBusy = busyProp || busyLocal;

  async function handleClick() {
    if (isBusy) return;
    try {
      setBusyLocal(true);
      await (onRefresh?.() ?? Promise.resolve());
    } finally {
      setBusyLocal(false);
    }
  }

  return (
    <button
      type="button"
      className={`refreshBtn ${isBusy ? "is-busy" : ""}`}
      aria-label={title}
      title={title}
      onClick={handleClick}
    >
      {/* Circular refresh glyph (stroked, white) */}
      <svg
        className="icon"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 12a9 9 0 1 1-3.3-6.95M21 4v6h-6"
        />
      </svg>

      <style jsx>{`
        .refreshBtn {
          height: 38px;
          width: 42px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 14px;
          border: 1px solid var(--border);
          background: var(--card);
          color: var(--text); /* icon inherits this */
          transition:
            background 0.15s ease,
            transform 0.12s ease,
            border-color 0.15s ease,
            box-shadow 0.15s ease;
        }
        .refreshBtn:hover {
          background: color-mix(in srgb, var(--text) 6%, var(--card));
        }
        .refreshBtn:active {
          transform: translateY(1px);
        }
        .refreshBtn:focus {
          outline: 2px solid color-mix(in srgb, var(--accent, #3b82f6) 60%, transparent);
          outline-offset: 2px;
        }

        .icon {
          display: block;
        }
        .is-busy .icon {
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </button>
  );
}
