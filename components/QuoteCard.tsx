'use client';

import useSWR from 'swr';
import { fetchJSON } from '@/lib/fetchJSON';

type Num = number | null;

interface Quote {
  ask: Num;
  bid: Num;
  close: Num;
  last: Num;
  mid: Num;
  symbol: string;
  volume: Num;
  error?: string;
  status?: number;
}

function pickPrice(q?: Quote): Num {
  if (!q) return null;
  const last = q.last;
  if (typeof last === 'number' && last > 0) return last;
  return q.mid ?? q.close ?? null;
}

export default function QuoteCard({ symbol }: { symbol: string }) {
  const key = symbol ? `/api/quote?symbol=${encodeURIComponent(symbol)}` : null;

  const { data, error, isValidating } = useSWR<Quote>(
    key,
    (url: string) => fetchJSON<Quote>(url),
    {
      keepPreviousData: true,
      dedupingInterval: 1500,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );

  const q = data;
  const px = pickPrice(q);
  const vol = q?.volume ?? null;

  return (
    <section className="rounded-md border border-gray-200 p-4">
      <div className="flex items-baseline gap-3">
        <h2 className="text-xl font-semibold">Quote</h2>
        <span className="font-mono text-gray-600">{symbol || '—'}</span>
        {isValidating && <span className="text-xs text-gray-500">loading…</span>}
      </div>

      {error && (
        <div className="mt-2 text-sm text-red-600">
          Failed to load quote.
        </div>
      )}
      {q?.error && (
        <div className="mt-2 text-sm text-amber-600">
          API error: {q.error}
        </div>
      )}

      <div className="mt-2 text-4xl font-mono">
        {typeof px === 'number' ? px.toFixed(2) : '—'}
      </div>

      <div className="mt-1 text-sm text-gray-600 space-x-3">
        <span>bid {q?.bid ?? '—'}</span>
        <span>ask {q?.ask ?? '—'}</span>
        <span>vol {vol ?? '—'}</span>
      </div>
    </section>
  );
}
