// components/OptionChainTable.tsx
'use client';
import React from 'react';
import useSWR from 'swr';

type Leg = {
  strike: number; right: 'C'|'P';
  bid: number|null; ask: number|null; mid: number|null; last: number|null;
  volume: number|null; impliedVol: number|null;
};
type Chain = {
  ok?: boolean; symbol?: string; expiry?: string;
  underlying?: { last?: number|null };
  calls: Leg[]; puts: Leg[];
};

function fmt(x: number|null|undefined) {
  return x == null || Number.isNaN(x) ? '—' : Number(x).toFixed(2);
}

const fetcher = (url: string) => fetch(url).then(r => r.json());

export default function OptionChainTable({ symbol }: { symbol: string }) {
  const { data, error } = useSWR<Chain>(
    `/api/optionChain?symbol=${symbol}&window=3`,
    fetcher,
    { refreshInterval: 10000 }
  );

  if (error) return <div style={{padding: 20, color: '#999'}}>Failed to load option chain</div>;
  if (!data) return <div style={{padding: 20, color: '#999'}}>Loading option chain...</div>;
  if (!data.calls || !data.puts) return <div style={{padding: 20, color: '#999'}}>No option data available</div>;
  const strikes = Array.from(
    new Set<number>([
      ...(data.calls || []).map(c => c.strike),
      ...(data.puts || []).map(p => p.strike),
    ])
  ).sort((a,b)=>a-b);

  const byStrike = (arr: Leg[], s: number) => arr.find(x => x.strike === s);

  return (
    <div className="wrap">
      <h3 style={{fontSize: 16, fontWeight: 600, marginBottom: 10}}>Option Chain</h3>
      <table className="table">
        <thead>
          <tr>
            <th className="center">CALL Bid</th>
            <th className="center">Mid</th>
            <th className="center">Ask</th>
            <th className="center strike">Strike</th>
            <th className="center">Bid</th>
            <th className="center">Mid</th>
            <th className="center">ASK PUT</th>
          </tr>
        </thead>
        <tbody>
          {strikes.map(s => {
            const c = byStrike(data.calls, s);
            const p = byStrike(data.puts, s);
            return (
              <tr key={s}>
                <td>{fmt(c?.bid)}</td>
                <td>{fmt(c?.mid)}</td>
                <td>{fmt(c?.ask)}</td>
                <td className="strike">{s.toFixed(2)}</td>
                <td>{fmt(p?.bid)}</td>
                <td>{fmt(p?.mid)}</td>
                <td>{fmt(p?.ask)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
