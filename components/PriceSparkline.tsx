// components/PriceSparkline.tsx
'use client';

import React from 'react';
import useSWR from 'swr';
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip);

type Quote = { last?: number | null; mid?: number | null; close?: number | null };

const fetcher = (url: string) =>
  fetch(url, { cache: 'no-store' }).then(r => r.json());

const isNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

function choosePrice(q?: Quote): number | null {
  if (!q) return null;
  if (isNum(q.last) && q.last > 0) return q.last;
  if (isNum(q.mid)) return q.mid;
  if (isNum(q.close)) return q.close;
  return null;
}

export default function PriceSparkline({ symbol }: { symbol: string }) {
  const { data } = useSWR<Quote>(
    `/api/quote?symbol=${encodeURIComponent(symbol)}`,
    fetcher,
    { refreshInterval: 15000 }
  );

  const [series, setSeries] = React.useState<number[]>([]);
  const [labels, setLabels] = React.useState<string[]>([]);

  // Reset when symbol changes
  React.useEffect(() => {
    setSeries([]);
    setLabels([]);
  }, [symbol]);

  // Push preferred price when available
  React.useEffect(() => {
    const v = choosePrice(data);
    if (isNum(v)) {
      setSeries(prev => [...prev.slice(-29), v]);
      setLabels(prev => [...prev.slice(-29), '']);
    }
  }, [data]);

  const chartData = {
    labels,
    datasets: [
      {
        data: series,
        fill: false,
        tension: 0.3,
        borderWidth: 2,
        pointRadius: 3,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: { x: { display: false }, y: { display: false } },
  } as const;

  return <Line data={chartData} options={options} />;
}
