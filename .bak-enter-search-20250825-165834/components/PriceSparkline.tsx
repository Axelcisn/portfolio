// components/PriceSparkline.tsx
'use client';
import React from 'react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend } from 'chart.js';
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

export default function PriceSparkline({ symbol }: { symbol: string }) {
  const [points, setPoints] = React.useState<number[]>([]);
  const labels = points.map((_, i) => String(i + 1));

  React.useEffect(() => {
    let t: any;
    const tick = async () => {
      const r = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`, { cache: 'no-store' });
      const j = await r.json();
      const v: number | undefined = j.last ?? j.close ?? j.mid;
      if (typeof v === 'number' && !Number.isNaN(v)) {
        setPoints(prev => [...prev.slice(-59), v]);
      }
      t = setTimeout(tick, 2500);
    };
    tick();
    return () => clearTimeout(t);
  }, [symbol]);

  const data = { labels, datasets: [{ data: points, tension: 0.3 }] };
  const options = { responsive: true, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: false } } } as const;
  return <Line data={data} options={options} />;
}
