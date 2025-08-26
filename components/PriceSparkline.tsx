// components/PriceSparkline.tsx
"use client";

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

const fetcher = (url: string) =>
  fetch(url, { cache: 'no-store' }).then(r => r.json());

const isNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

// Extract price from optionChain response
function choosePriceFromChain(chain?: any): number | null {
  if (!chain || typeof chain !== 'object') return null;
  const u = (chain as any).underlying;
  if (!u) return null;
  const { last, bid, ask } = u as any;
  if (isNum(last) && last > 0) return last;
  if (isNum(bid) && isNum(ask) && bid > 0 && ask > 0) return (bid + ask) / 2;
  if (isNum(bid) && bid > 0) return bid;
  if (isNum(ask) && ask > 0) return ask;
  return null;
}

export default function PriceSparkline({ symbol }: { symbol: string }) {
  const { data } = useSWR<any>(
    `/api/optionChain?symbol=${encodeURIComponent(symbol)}&window=0`,
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
    const v = choosePriceFromChain(data);
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
