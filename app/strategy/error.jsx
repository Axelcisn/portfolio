// app/strategy/error.jsx
"use client";

import { useEffect } from "react";

export default function StrategyError({ error, reset }) {
  useEffect(() => {
    // Log for debugging; share the console screenshot with me.
    // eslint-disable-next-line no-console
    console.error("[/strategy] render error:", error);
  }, [error]);

  return (
    <div className="wrap" role="alert">
      <div className="card">
        <div className="title">Strategy failed to render</div>
        <div className="sub">Something went wrong on this page. You can try again.</div>
        <div className="actions">
          <button className="btn" onClick={() => reset()}>Retry</button>
        </div>
        {error?.message ? (
          <pre className="details">{String(error.message).slice(0, 600)}</pre>
        ) : null}
      </div>

      <style jsx>{`
        .wrap{
          min-height: 40vh;
          display:flex; align-items:center; justify-content:center;
          padding: 24px;
        }
        .card{
          width: 100%;
          max-width: 680px;
          border:1px solid var(--border, #E6E9EF);
          background: var(--card, #fff);
          color: var(--text, #0f172a);
          border-radius:16px;
          padding:20px 22px;
          box-shadow: 0 12px 40px rgba(0,0,0,.12);
        }
        .title{ font-weight:800; font-size:16px; margin-bottom:6px; }
        .sub{ opacity:.8; font-size:13.5px; }
        .actions{ margin-top:12px; }
        .btn{
          height:36px; padding:0 14px; border-radius:12px;
          border:1px solid color-mix(in srgb, var(--accent, #3b82f6) 40%, var(--border, #E6E9EF));
          background: color-mix(in srgb, var(--accent, #3b82f6) 12%, var(--card, #fff));
          color: var(--text, #0f172a); font-weight:800;
        }
        .btn:hover{ filter: brightness(1.03); }
        .details{
          margin-top:12px; padding:10px; border-radius:10px;
          background: color-mix(in srgb, var(--surface, #f7f9fc) 70%, transparent);
          overflow:auto; font-size:12px;
        }
      `}</style>
    </div>
  );
}
