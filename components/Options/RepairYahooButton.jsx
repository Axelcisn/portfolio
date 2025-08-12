// components/Options/RepairYahooButton.jsx
"use client";

import { useEffect, useState } from "react";
import {
  getYahooStatus,
  repairYahoo,
  statusSeverity,
  formatAge,
} from "@/lib/client/yahooSession";

export default function RepairYahooButton({ className = "" }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  async function refresh() {
    try {
      setErr(null);
      const data = await getYahooStatus();
      setStatus(data);
    } catch (e) {
      setStatus(null);
      setErr(e?.message || "Status check failed");
    }
  }

  async function onRepair() {
    try {
      setLoading(true);
      setErr(null);
      const data = await repairYahoo();
      setStatus(data);
    } catch (e) {
      setErr(e?.message || "Repair failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // no interval; keep it manual to avoid noise
  }, []);

  const sev = statusSeverity(status); // 0 ok, 1 warn, 2 bad
  const title =
    err ??
    (status
      ? `Yahoo session: ${status.ok ? "OK" : "Needs repair"} • Cookie: ${
          status.hasCookie ? "yes" : "no"
        } • Crumb: ${status.hasCrumb ? "yes" : "no"} • Age: ${formatAge(
          status.ageMs
        )}${status.lastError ? ` • Last: ${status.lastError}` : ""}`
      : "Checking Yahoo session…");

  return (
    <>
      <button
        type="button"
        className={`repair ${className} ${loading ? "is-loading" : ""} ${
          sev === 2 ? "is-bad" : sev === 1 ? "is-warn" : "is-ok"
        }`}
        onClick={onRepair}
        title={title}
        aria-busy={loading ? "true" : "false"}
      >
        <span className="dot" aria-hidden="true" />
        {loading ? "Repairing…" : "Repair Yahoo"}
      </button>

      <style jsx>{`
        .repair {
          height: 38px;
          padding: 0 14px;
          border-radius: 14px;
          border: 1px solid var(--border, #e6e9ef);
          background: var(--card, #fff);
          color: var(--text, #0f172a);
          font-weight: 800;
          font-size: 14px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
        }
        .repair.is-loading {
          opacity: 0.8;
          cursor: default;
        }
        .dot {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: currentColor;
          display: inline-block;
        }
        /* Status colors — keep subtle to not disrupt your design */
        .repair.is-ok {
          border-color: color-mix(in srgb, #10b981 30%, var(--border, #e6e9ef));
          color: color-mix(in srgb, #10b981 65%, var(--text, #0f172a));
          background: color-mix(in srgb, #10b981 10%, var(--card, #fff));
        }
        .repair.is-warn {
          border-color: color-mix(in srgb, #f59e0b 40%, var(--border, #e6e9ef));
          color: color-mix(in srgb, #f59e0b 75%, var(--text, #0f172a));
          background: color-mix(in srgb, #f59e0b 10%, var(--card, #fff));
        }
        .repair.is-bad {
          border-color: color-mix(in srgb, #ef4444 55%, var(--border, #e6e9ef));
          color: color-mix(in srgb, #ef4444 85%, var(--text, #0f172a));
          background: color-mix(in srgb, #ef4444 10%, var(--card, #fff));
        }
      `}</style>
    </>
  );
}
