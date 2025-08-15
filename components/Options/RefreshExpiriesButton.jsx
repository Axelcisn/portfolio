// components/Options/RefreshExpiriesButton.jsx
"use client";

import { useState, useCallback } from "react";

export default function RefreshExpiriesButton({
  onRefresh,
  busy: busyProp = false,
  title = "Refresh expiries",
}) {
  const [busyLocal, setBusyLocal] = useState(false);
  const isBusy = busyProp || busyLocal;

  const handleClick = useCallback(async () => {
    if (isBusy) return;
    try {
      setBusyLocal(true);
      const p = onRefresh?.();
      if (p && typeof p.then === "function") {
        await p; // wait for async refresh if provided
      }
    } finally {
      setBusyLocal(false);
    }
  }, [isBusy, onRefresh]);

  return (
    <button
      type="button"
      className={`refreshBtn ${isBusy ? "is-busy" : ""}`}
      aria-label={title}
      title={title}
      onClick={handleClick}
      disabled={isBusy}
    >
      {/* circular refresh icon */}
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
        .refreshBtn{
          height:38px; width:42px;
          display:inline-flex; align-items:center; justify-content:center;
          border-radius:14px; border:1px solid var(--border);
          background:var(--card); color:var(--text);
          transition: background .15s ease, transform .12s ease, border-color .15s ease;
        }
        .refreshBtn:hover:not(:disabled){
          background: color-mix(in srgb, var(--text) 6%, var(--card));
        }
        .refreshBtn:active:not(:disabled){ transform: translateY(1px); }
        .refreshBtn:disabled{ opacity:.6; cursor:not-allowed; }

        .icon{ display:block; }
        .is-busy .icon{ animation:spin .8s linear infinite; }
        @keyframes spin{ to{ transform:rotate(360deg); } }
      `}</style>
    </button>
  );
}
