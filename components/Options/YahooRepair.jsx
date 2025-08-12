// components/Options/YahooRepair.jsx
"use client";

import { useEffect, useState } from "react";
import { getYahooStatus, repairYahoo } from "@/lib/client/yahooAdmin";

export default function YahooRepair({ className = "", onStatus }) {
  const [loading, setLoading] = useState(false);
  const [healthy, setHealthy] = useState(true);
  const [lastError, setLastError] = useState(null);

  async function refresh() {
    try {
      setLoading(true);
      const s = await getYahooStatus(); // { ok, hasCookie, hasCrumb, ageMs, lastError }
      const isHealthy = !!(s?.ok && s?.hasCookie);
      setHealthy(isHealthy);
      setLastError(s?.lastError || null);
      onStatus?.(s);
    } catch (e) {
      setHealthy(false);
      setLastError(e?.message || "Status check failed");
      onStatus?.({ ok: false, error: e?.message });
    } finally {
      setLoading(false);
    }
  }

  async function onRepair() {
    try {
      setLoading(true);
      const r = await repairYahoo(); // { ok, crumb:boolean, lastError }
      // After repairing, re-check
      await refresh();
      if (!r?.ok) setLastError(r?.lastError || "Repair failed");
    } catch (e) {
      setLastError(e?.message || "Repair failed");
      setHealthy(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const label = loading
    ? "Repairing…"
    : healthy
    ? "Yahoo OK"
    : "Repair Yahoo";

  return (
    <button
      type="button"
      onClick={healthy || loading ? refresh : onRepair}
      className={`pill ${healthy ? "is-ok" : "is-bad"} ${loading ? "is-busy" : ""} ${className}`}
      aria-busy={loading ? "true" : "false"}
      title={lastError ? String(lastError) : (healthy ? "Session healthy" : "Click to repair")}
      disabled={loading}
    >
      <span className={`dot ${healthy ? "good" : "bad"}`} aria-hidden="true" />
      {label}
    </button>
  );
}

/* Local styles: visually match your existing pills without changing global CSS */
<style jsx>{`
  .pill{
    height:36px; padding:0 12px; border-radius:12px;
    border:1px solid var(--border); background:var(--card);
    color:var(--text); font-weight:700; font-size:14px; line-height:1;
    display:inline-flex; align-items:center; gap:8px; cursor:pointer;
    transition: background .15s ease, border-color .15s ease, opacity .15s ease;
  }
  .pill.is-ok{
    /* subtle accent tint like your other active pills */
    background: color-mix(in srgb, var(--accent, #3b82f6) 10%, var(--card));
    border-color: color-mix(in srgb, var(--accent, #3b82f6) 30%, var(--border));
  }
  .pill.is-bad{
    /* turns red when broken */
    background: color-mix(in srgb, #ef4444 14%, var(--card));
    border-color: color-mix(in srgb, #ef4444 45%, var(--border));
  }
  .pill.is-busy{ opacity:.7; cursor:default; }

  .dot{
    width:8px; height:8px; border-radius:999px; flex:0 0 auto;
    background: #d1d5db;
  }
  .dot.good{ background:#10b981; } /* green */
  .dot.bad{ background:#ef4444; }   /* red */
`}</style>
