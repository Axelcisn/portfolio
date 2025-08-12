// app/tools/yahoo/page.jsx
"use client";

import { useEffect, useState } from "react";
import {
  getYahooStatus,
  repairYahoo,
  statusToBadge,
} from "@/lib/client/yahooSession";

export default function YahooStatusPage() {
  const [session, setSession] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = async () => {
    setBusy(true);
    setMsg("");
    const s = await getYahooStatus();
    setSession(s);
    setBusy(false);
  };

  useEffect(() => {
    load();
  }, []);

  const onRepair = async () => {
    setBusy(true);
    setMsg("");
    try {
      const r = await repairYahoo();
      setMsg(r.ok ? "Session repaired." : "Repair failed.");
    } catch (e) {
      setMsg(e?.message || "Repair failed.");
    } finally {
      await load();
      setBusy(false);
    }
  };

  const badge = statusToBadge(session || {});
  const ageMin =
    typeof session?.ageMs === "number"
      ? Math.floor(session.ageMs / 60000)
      : null;

  return (
    <div className="wrap">
      <h1>Yahoo Status</h1>

      <div className="card">
        <div className="row">
          <div className={`dot ${badge.state}`} aria-hidden="true" />
          <div className="kv">
            <div className="k">State</div>
            <div className="v">
              {badge.state === "ok"
                ? "OK"
                : badge.state === "warn"
                ? "Stale (consider repair)"
                : "Not valid"}
            </div>
          </div>
        </div>

        <div className="grid">
          <div className="kv">
            <div className="k">Cookie</div>
            <div className="v">{session?.hasCookie ? "present" : "missing"}</div>
          </div>
          <div className="kv">
            <div className="k">Crumb</div>
            <div className="v">{session?.hasCrumb ? "present" : "missing"}</div>
          </div>
          <div className="kv">
            <div className="k">Age</div>
            <div className="v">{ageMin != null ? `${ageMin} min` : "—"}</div>
          </div>
        </div>

        {session?.lastError ? (
          <div className="err">
            <b>Last error:</b> {session.lastError}
          </div>
        ) : null}

        {msg ? <div className="msg">{msg}</div> : null}

        <div className="actions">
          <button className="btn" onClick={load} disabled={busy}>
            {busy ? "Checking…" : "Refresh"}
          </button>
          <button
            className={`btn repair ${badge.state === "bad" ? "danger" : ""}`}
            onClick={onRepair}
            disabled={busy}
          >
            {busy ? "Repairing…" : "Repair Yahoo"}
          </button>
        </div>
      </div>

      <style jsx>{`
        .wrap {
          max-width: 720px;
          margin: 24px auto;
          padding: 0 16px;
        }
        h1 {
          font-size: 24px;
          font-weight: 800;
          margin: 0 0 14px;
          color: var(--text);
        }
        .card {
          border: 1px solid var(--border);
          background: var(--card);
          color: var(--text);
          border-radius: 14px;
          padding: 16px;
        }

        .row {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 10px;
        }
        .dot {
          width: 12px;
          height: 12px;
          border-radius: 999px;
          border: 2px solid transparent;
        }
        .dot.ok {
          background: #10b981; /* green */
        }
        .dot.warn {
          background: #f59e0b; /* amber */
        }
        .dot.bad {
          background: #ef4444; /* red */
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(120px, 1fr));
          gap: 10px 16px;
          margin: 10px 0 6px;
        }
        .kv .k {
          font-size: 12px;
          opacity: 0.7;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          font-weight: 800;
          margin-bottom: 2px;
        }
        .kv .v {
          font-weight: 700;
        }

        .err {
          margin-top: 8px;
          font-size: 13px;
          padding: 8px;
          border-radius: 10px;
          background: color-mix(in srgb, #ef4444 12%, var(--card));
          border: 1px solid color-mix(in srgb, #ef4444 35%, var(--border));
        }
        .msg {
          margin-top: 8px;
          font-size: 13px;
          padding: 8px;
          border-radius: 10px;
          background: color-mix(in srgb, var(--accent, #3b82f6) 10%, var(--card));
          border: 1px solid color-mix(in srgb, var(--accent, #3b82f6) 35%, var(--border));
        }

        .actions {
          display: flex;
          gap: 10px;
          margin-top: 12px;
        }
        .btn {
          height: 36px;
          padding: 0 14px;
          border-radius: 10px;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text);
          font-weight: 800;
          cursor: pointer;
        }
        .btn:disabled {
          opacity: 0.6;
          cursor: default;
        }
        .btn.repair.danger {
          border-color: color-mix(in srgb, #ef4444 40%, var(--border));
          background: color-mix(in srgb, #ef4444 10%, var(--surface));
        }
      `}</style>
    </div>
  );
}
