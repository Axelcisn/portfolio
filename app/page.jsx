import Link from "next/link";

export default function Page() {
  return (
    <div className="grid grid-3">
      <section className="card">
        <h3>Recently analyzed tickers</h3>
        <div className="small">AAPL, MSFT, NVDA (placeholder)</div>
      </section>

      <section className="card">
        <h3>Market snapshot</h3>
        <div className="small">Index (annualized) — placeholder</div>
      </section>

      <section className="card">
        <h3>Shortcuts</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link className="btn" href="/strategy">Open Strategy</Link>
          <Link className="btn" href="/portfolio">Open Portfolio</Link>
        </div>
      </section>
    </div>
  );
}
