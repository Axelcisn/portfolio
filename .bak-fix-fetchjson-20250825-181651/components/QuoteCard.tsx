// components/QuoteCard.tsx
'use client';

import React from 'react';
import useSWR from 'swr';

type Quote = {
  symbol?: string;
  last?: number | null;
  mid?: number | null;
  close?: number | null;
  bid?: number | null;
  ask?: number | null;
  volume?: number | null;
};

const fetcher = (url: string) =>
  fetch(url, { cache: 'no-store' }).then(r => r.json());

const isNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

// Prefer: last>0  → mid → close
function choosePrice(q?: Quote): number | null {
  if (!q) return null;
  if (isNum(q.last) && q.last > 0) return q.last;
  if (isNum(q.mid)) return q.mid;
  if (isNum(q.close)) return q.close;
  return null;
}

function fmtPrice(v: number | null): string {
  return isNum(v) ? v.toFixed(2) : '—';
}

function fmtVol(v?: number | null): string {
  return isNum(v) && v > 0 ? new Intl.NumberFormat().format(v) : '—';
}

export default function QuoteCard({ symbol }: { symbol: string }) {
  const { data, isLoading, mutate } = useSWR<Quote>(
    `/api/quote?symbol=${encodeURIComponent(symbol)}`,
    fetcher,
    { refreshInterval: 12000 }
  );

  const px = choosePrice(data);
  const vol = fmtVol(data?.volume);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        border: '1px solid #eee',
        borderRadius: 12,
        padding: '12px 14px',
        background: '#fff',
        minHeight: 56
      }}
    >
      <strong style={{ fontSize: 18 }}>{symbol}</strong>
      <span style={{ fontSize: 18 }}>{fmtPrice(px)}</span>
      <span style={{ color: '#777' }}>vol {vol}</span>
      <span style={{ flex: 1 }} />
      <button
        onClick={() => mutate()}
        style={{
          padding: '8px 12px',
          border: '1px solid #ddd',
          borderRadius: 10,
          background: '#fff',
          cursor: 'pointer'
        }}
        aria-label="Refresh quote"
      >
        Refresh
      </button>
      {isLoading ? (
        <span style={{ color: '#999', fontSize: 12, marginLeft: 6 }}>loading…</span>
      ) : null}
    </div>
  );
}
