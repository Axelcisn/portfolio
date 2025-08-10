// components/Strategy/StatsRail.jsx
"use client";

/**
 * Key Stats panel only.
 * Removed: Strategy summary + Distribution(S). No sticky positioning.
 * Sits to the right of the Market card and matches its row height naturally via CSS grid.
 */

export default function StatsRail({ spot, currency, company, iv, market }) {
  const name = company?.name || company?.symbol || "—";
  const fmt = (n, d = 2) =>
    Number.isFinite(n) ? Number(n).toFixed(d).replace(/\.00$/, "") : "—";
  const money = (n) =>
    Number.isFinite(n)
      ? `${currency === "EUR" ? "€" : currency === "GBP" ? "£" : "$"}${fmt(n, 2)}`
      : "—";
  const pct = (n, d = 2) =>
    Number.isFinite(n) ? `${Number(n).toFixed(d)}%` : "—";

  const beta = company?.beta;
  const hi52 = company?.high52;
  const lo52 = company?.low52;

  return (
    <aside className="card">
      <h3>Key stats</h3>

      <div className="kv">
        <div className="stat-row">
          <div className="k">Spot</div>
          <div className="v">{money(spot)}</div>
        </div>

        <div className="stat-row">
          <div className="k">IV (ann.)</div>
          <div className="v">{pct((iv ?? 0) * 100, 2)}</div>
        </div>

        <div className="stat-row">
          <div className="k">Beta</div>
          <div className="v">{Number.isFinite(beta) ? fmt(beta, 2) : "—"}</div>
        </div>

        <div className="stat-row">
          <div className="k">52W High</div>
          <div className="v">{money(hi52)}</div>
        </div>

        <div className="stat-row">
          <div className="k">52W Low</div>
          <div className="v">{money(lo52)}</div>
        </div>

        <div className="stat-row">
          <div className="k">Risk‑free</div>
          <div className="v">{pct(market?.riskFree, 2)}</div>
        </div>

        <div className="stat-row">
          <div className="k">Index μ</div>
          <div className="v">{pct(market?.indexAnn, 2)}</div>
        </div>
      </div>

      <style jsx>{`
        .kv {
          display: grid;
          gap: 6px;
        }
        .stat-row {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          padding: 6px 0;
          border-bottom: 1px dashed var(--border);
        }
        .stat-row:last-child {
          border-bottom: 0;
        }
        .k {
          font-size: 12px;
          opacity: 0.75;
        }
        .v {
          font-variant-numeric: tabular-nums;
          font-weight: 600;
        }
      `}</style>
    </aside>
  );
}
