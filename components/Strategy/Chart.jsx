"use client";
export default function Chart({ pLow = -0.2, pHigh = 0.2, expected = 0 }) {
  const width = 800, height = 300, pad = 40;
  const x = v => pad + ((v + 0.5) * (width - pad * 2));            // -50%..+50% → px
  const y = v => height - pad - ((v + 1) * (height - pad * 2) / 2); // -100..+100% → px
  return (
    <section className="card">
      <h3>Chart</h3>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
        <line x1={x(-0.5)} y1={y(0)} x2={x(0.5)} y2={y(0)} stroke="currentColor" opacity="0.2" />
        <line x1={x(0)} y1={y(-1)} x2={x(0)} y2={y(1)} stroke="currentColor" opacity="0.4" />
        <rect x={x(pLow)} y={y(1)} width={x(pHigh) - x(pLow)} height={y(-1) - y(1)} fill="currentColor" opacity="0.06" />
        <line x1={x(expected)} y1={y(-1)} x2={x(expected)} y2={y(1)} stroke="currentColor" opacity="0.3" strokeDasharray="4 4" />
        <text x={x(0) + 6} y={y(1) + 14} className="small">S (0%)</text>
        <text x={x(pLow) + 4} y={y(1) + 14} className="small">Sₗ</text>
        <text x={x(pHigh) + 4} y={y(1) + 14} className="small">Sᵤ</text>
        <text x={x(expected) + 4} y={y(1) + 28} className="small">E[S]</text>
      </svg>
      <div className="small">Y: Profit (%) · X: Price Change (%)</div>
    </section>
  );
}
