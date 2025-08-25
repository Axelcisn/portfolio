'use client';
import useSWR from 'swr';

type Quote = {
  symbol: string; bid?: number|null; ask?: number|null; last?: number|null;
  close?: number|null; mid?: number|null; volume?: number|null;
};

const fetcher = (u: string) => fetch(u).then(r => r.json());

export default function QuoteCard({ symbol }: { symbol: string }) {
  const { data, error, mutate } = useSWR<Quote>(`/api/quote?symbol=${encodeURIComponent(symbol)}`, fetcher);
  const q = data || {};
  const px = q.last ?? q.mid ?? q.close ?? null;

  return (
    <div style={{border:'1px solid #eee',borderRadius:8,padding:12,background:'#fff'}}>
      <div style={{display:'flex',gap:8,alignItems:'baseline'}}>
        <strong>{symbol}</strong>
        <span>{px!=null ? Number(px).toFixed(2) : '—'}</span>
        <small style={{color:'#666'}}>vol {q.volume ?? '—'}</small>
        <button onClick={()=>mutate()} style={{marginLeft:'auto',padding:'4px 8px',border:'1px solid #ddd',borderRadius:6,background:'#fff'}}>Refresh</button>
      </div>
      {error && <div style={{color:'#b00',marginTop:6}}>Failed to load</div>}
    </div>
  );
}
