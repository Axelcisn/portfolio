export default function Strategy() {
  return (
    <div className="grid grid-2">
      <div className="card">
        <h3>Company</h3>
        <div className="small">Ticker, name, sector (placeholder)</div>
      </div>
      <div className="card">
        <h3>Market</h3>
        <div className="small">Spot, IV, rate (placeholder)</div>
      </div>

      <div className="card">
        <h3>Legs</h3>
        <div className="grid grid-2">
          <div className="card"><strong>Long Call</strong><div className="small">strike/qty</div></div>
          <div className="card"><strong>Short Call</strong><div className="small">strike/qty</div></div>
          <div className="card"><strong>Long Put</strong><div className="small">strike/qty</div></div>
          <div className="card"><strong>Short Put</strong><div className="small">strike/qty</div></div>
        </div>
      </div>

      <div className="card">
        <h3>Chart</h3>
        <div className="small">Payoff SVG + Monte Carlo overlays (placeholder)</div>
      </div>

      <div className="card">
        <h3>Monte Carlo mini-cards</h3>
        <div className="grid grid-3">
          <div className="card">μ / drift</div>
          <div className="card">σ / vol</div>
          <div className="card">VaR / tails</div>
        </div>
      </div>

      <div className="card">
        <h3>Summary</h3>
        <div className="grid grid-3">
          <div className="card">Net Premium</div>
          <div className="card">Probability of Profit</div>
          <div className="card">Expectancy</div>
        </div>
      </div>
    </div>
  );
}
