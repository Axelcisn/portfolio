'use client';

import React, { useMemo, useState } from 'react';
import useSWR from 'swr';
import { fetchJSON } from '@/lib/fetchJSON';

type Num = number | null;
type Right = 'C' | 'P';

interface Opt {
  conid: number;
  right: Right;
  strike: number;
  bid: Num;
  ask: Num;
  mid: Num;
  impliedVol?: Num;
  openInterest?: number | null;
  volume?: number | null;
  last?: Num;
}

interface Chain {
  expiry?: string;
  calls: Opt[];
  puts: Opt[];
  error?: string;
}

const swrOpts = {
  keepPreviousData: true,
  dedupingInterval: 1500,
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
};

function normalizeExpiryForDisplay(s: string): string {
  const raw = (s || '').replace(/[^0-9]/g, '');
  if (raw.length === 8) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  return s;
}
function wireExpiryForApi(s: string): string {
  // API likely expects YYYYMMDD; strip dashes/spaces just in case
  const raw = (s || '').replace(/[^0-9]/g, '');
  return raw || s;
}
function parseExpiriesList(x: any): string[] {
  if (Array.isArray(x)) return x;
  if (x && Array.isArray(x.expiries)) return x.expiries;
  return [];
}

const dash = '—';
const fmtPx = (n: Num) => (typeof n === 'number' ? n.toFixed(2) : dash);
const fmtInt = (n: number | null | undefined) =>
  typeof n === 'number' ? n.toLocaleString() : dash;
const fmtIV = (n: Num) => (typeof n === 'number' ? n.toFixed(2) : dash);

type Row = { strike: number; call?: Opt; put?: Opt };
function mergeRows(calls: Opt[], puts: Opt[]): Row[] {
  const m = new Map<number, Row>();
  for (const c of calls || []) {
    const r = m.get(c.strike) ?? { strike: c.strike };
    r.call = c; m.set(c.strike, r);
  }
  for (const p of puts || []) {
    const r = m.get(p.strike) ?? { strike: p.strike };
    r.put = p; m.set(p.strike, r);
  }
  return Array.from(m.values()).sort((a, b) => a.strike - b.strike);
}

export default function OptionChainTable({ symbol }: { symbol: string }) {
  const sym = (symbol || '').trim().toUpperCase();

  const [expiry, setExpiry] = useState<string>('');     // '' = Auto (nearest)
  const [windowSize, setWindowSize] = useState<number>(1);

  // Expiries list
  const expKey = sym ? `/api/expiries?symbol=${encodeURIComponent(sym)}` : null;
  const { data: expiriesRaw } = useSWR<any>(expKey, (u: string) => fetchJSON(u), swrOpts);
  const expiriesRawList = useMemo(() => parseExpiriesList(expiriesRaw), [expiriesRaw]);

  // Chain: when expiry chosen, use /api/options; else use auto-nearest with window
  const chainKey = sym
    ? expiry
      ? `/api/options?symbol=${encodeURIComponent(sym)}&expiry=${encodeURIComponent(wireExpiryForApi(expiry))}`
      : `/api/optionChain?symbol=${encodeURIComponent(sym)}&window=${windowSize}`
    : null;

  const { data: chain, error, isValidating } = useSWR<Chain>(
    chainKey,
    (u: string) => fetchJSON<Chain>(u),
    swrOpts
  );

  const rows = useMemo(
    () => mergeRows(chain?.calls || [], chain?.puts || []),
    [chain?.calls, chain?.puts]
  );

  return (
    <section className="rounded-md border border-gray-200 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold">Options</h2>

        <label className="text-sm flex items-center gap-2">
          <span>Expiry:</span>
          <select
            className="border rounded px-2 py-1"
            value={expiry}
            onChange={(e) => setExpiry(e.currentTarget.value)}
          >
            <option value="">Nearest (auto)</option>
            {expiriesRawList.map((raw) => {
              const disp = normalizeExpiryForDisplay(raw);
              return (
                <option key={raw} value={disp}>{disp}</option>
              );
            })}
          </select>
        </label>

        {!expiry && (
          <label className="text-sm flex items-center gap-2">
            <span>Window:</span>
            <select
              className="border rounded px-2 py-1"
              value={windowSize}
              onChange={(e) => setWindowSize(Number(e.currentTarget.value))}
            >
              {[1, 2, 3, 5].map((n) => (
                <option key={n} value={n}>
                  ±{n} strikes
                </option>
              ))}
            </select>
          </label>
        )}

        {isValidating && <span className="text-xs text-gray-500">loading…</span>}
      </div>

      {error && (
        <div className="mt-2 text-sm text-red-600">Failed to load options.</div>
      )}
      {chain?.error && (
        <div className="mt-2 text-sm text-amber-600">API error: {chain.error}</div>
      )}

      <div className="mt-3 overflow-auto">
        <table className="min-w-full text-sm border border-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 py-1 border-b text-left">Strike</th>
              <th className="px-2 py-1 border-b text-right">C Bid</th>
              <th className="px-2 py-1 border-b text-right">C Mid</th>
              <th className="px-2 py-1 border-b text-right">C Ask</th>
              <th className="px-2 py-1 border-b text-right">C IV</th>
              <th className="px-2 py-1 border-b text-right">C OI</th>
              <th className="px-2 py-1 border-b text-right">C Vol</th>
              <th className="px-2 py-1 border-b text-right">P Bid</th>
              <th className="px-2 py-1 border-b text-right">P Mid</th>
              <th className="px-2 py-1 border-b text-right">P Ask</th>
              <th className="px-2 py-1 border-b text-right">P IV</th>
              <th className="px-2 py-1 border-b text-right">P OI</th>
              <th className="px-2 py-1 border-b text-right">P Vol</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.strike} className="odd:bg-white even:bg-gray-50">
                <td className="px-2 py-1 border-b font-mono">{r.strike}</td>

                <td className="px-2 py-1 border-b text-right">{fmtPx(r.call?.bid ?? null)}</td>
                <td className="px-2 py-1 border-b text-right">{fmtPx(r.call?.mid ?? null)}</td>
                <td className="px-2 py-1 border-b text-right">{fmtPx(r.call?.ask ?? null)}</td>
                <td className="px-2 py-1 border-b text-right">{fmtIV(r.call?.impliedVol ?? null)}</td>
                <td className="px-2 py-1 border-b text-right">{fmtInt(r.call?.openInterest)}</td>
                <td className="px-2 py-1 border-b text-right">{fmtInt(r.call?.volume)}</td>

                <td className="px-2 py-1 border-b text-right">{fmtPx(r.put?.bid ?? null)}</td>
                <td className="px-2 py-1 border-b text-right">{fmtPx(r.put?.mid ?? null)}</td>
                <td className="px-2 py-1 border-b text-right">{fmtPx(r.put?.ask ?? null)}</td>
                <td className="px-2 py-1 border-b text-right">{fmtIV(r.put?.impliedVol ?? null)}</td>
                <td className="px-2 py-1 border-b text-right">{fmtInt(r.put?.openInterest)}</td>
                <td className="px-2 py-1 border-b text-right">{fmtInt(r.put?.volume)}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td className="px-2 py-6 text-center text-gray-500" colSpan={13}>
                  No options for this selection.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
