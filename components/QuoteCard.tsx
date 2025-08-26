"use client";

import useSWR from 'swr';
import PriceSparkline from './PriceSparkline';
import { fetchJSON } from '@/lib/fetchJSON';

// Define a numeric type that may be null
type Num = number | null;

// Interface describing fields that might still be returned from a quote API (kept for compatibility)
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

// Data structure returned by /optionChain for the underlying instrument
interface Underlying {
  last: Num | undefined;
  bid: Num | undefined;
  ask: Num | undefined;
}

// Helper to pick a representative price from underlying data
function pickPriceFromUnderlying(u?: Underlying): Num {
  if (!u) return null;
  if (typeof u.last === 'number' && u.last > 0) return u.last;
  if (typeof u.bid === 'number' && typeof u.ask === 'number' && u.bid > 0 && u.ask > 0) {
    return (u.bid + u.ask) / 2;
  }
  if (typeof u.bid === 'number' && u.bid > 0) return u.bid;
  if (typeof u.ask === 'number' && u.ask > 0) return u.ask;
  return null;
}

export default function QuoteCard({ symbol }: { symbol: string }) {
  // Use /api/optionChain to fetch underlying price; window=0 fetches minimal data
  const key = symbol
    ? `/api/optionChain?symbol=${encodeURIComponent(symbol)}&window=0`
    : null;

  // Fetch chain data via SWR
  const { data, error, isValidating } = useSWR<any>(
    key,
    (url: string) => fetchJSON<any>(url),
    {
      keepPreviousData: true,
      dedupingInterval: 1500,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );

  // Extract underlying information and compute a price
  const underlying = (data && (data as any).underlying) || undefined;
  const px = pickPriceFromUnderlying(underlying as any);
  const bid = underlying?.bid ?? null;
  const ask = underlying?.ask ?? null;
  const vol = null;

  return (
    <section className="rounded-md border border-gray-200 p-4">
      <div className="flex items-baseline gap-3">
        <h2 className="text-xl font-semibold">Quote</h2>
        <span className="font-mono text-gray-600">{symbol || '—'}</span>
        {/* badge indicating delayed IBKR data */}
        <span className="ml-2 text-xs text-gray-500 bg-gray-100 border rounded px-2 py-0.5">
          Delayed (IBKR)
        </span>
        {isValidating && <span className="text-xs text-gray-500">loading…</span>}
      </div>

      {error && <div className="mt-2 text-sm text-red-600">Failed to load quote.</div>}
      {data?.error && (
        <div className="mt-2 text-sm text-amber-600">
          API error: {(data as any).error}
        </div>
      )}

      <div className="mt-2 flex items-end gap-4">
        <div className="text-4xl font-mono">
          {typeof px === 'number' ? px.toFixed(2) : '—'}
        </div>
        <div className="flex-1 h-12">
          {/* mini sparkline chart showing recent prices */}
          <PriceSparkline symbol={symbol} />
        </div>
      </div>

      <div className="mt-1 text-sm text-gray-600 space-x-3">
        <span>bid {bid ?? '—'}</span>
        <span>ask {ask ?? '—'}</span>
        <span>vol {vol ?? '—'}</span>
      </div>
    </section>
  );
}
