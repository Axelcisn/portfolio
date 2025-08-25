// app/page.tsx
'use client';

import React from 'react';
import useSWR from 'swr';
import OptionChainTable from '@/components/OptionChainTable';
import PriceSparkline from '@/components/PriceSparkline';
import QuoteCard from '@/components/QuoteCard';

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then(r => r.json());

export default function HomePage() {
  const [symbol, setSymbol] = React.useState('AAPL');
  const [win, setWin] = React.useState(3);

  const { data: chain, isLoading, mutate } = useSWR(
    `/api/optionChain?symbol=${encodeURIComponent(symbol)}&window=${win}`,
    fetcher,
    { refreshInterval: 5000 }
  );

  return (
    <main style={{padding:'20px', maxWidth:'1100px', margin:'0 auto', fontFamily:'system-ui,-apple-system,Segoe UI,Roboto,sans-serif'}}>
      <h1 style={{fontSize:24, fontWeight:700}}>IB Option Chain (via TWS Bridge)</h1>

      <div style={{display:'flex', gap:12, alignItems:'center', margin:'8px 0 12px 0'}}>
        <label>Symbol:
          <input value={symbol} onChange={e=>setSymbol(e.target.value.toUpperCase())}
                 style={{marginLeft:6,padding:6,border:'1px solid #ddd',borderRadius:6}} />
        </label>
        <label>Window:
          <select value={win} onChange={e=>setWin(parseInt(e.target.value))}
                  style={{marginLeft:6,padding:6,border:'1px solid #ddd',borderRadius:6}}>
            {[2,3,4,5,6,8].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <button onClick={()=>mutate()} style={{padding:'6px 10px',border:'1px solid #ddd',borderRadius:6,background:'#fff'}}>Refresh</button>
        {chain?.underlying?.last != null && (
          <span className="badge">Underlying: {symbol} {Number(chain.underlying.last).toFixed(2)}</span>
        )}
      </div>

      <div style={{background:'#fff',padding:8,border:'1px solid #eee',borderRadius:8,marginBottom:12}}>
        <PriceSparkline symbol={symbol} />
      </div>

      <QuoteCard symbol={symbol} />

      {!chain && isLoading && <p>Loading…</p>}
      {chain?.ok === false && <p style={{color:'#b00'}}>Error: {(chain as any).error || 'failed to load'}</p>}
      {chain?.calls && chain?.puts ? <OptionChainTable data={chain as any} /> : null}

      <p style={{marginTop:12,color:'#666',fontSize:12}}>
        Data is delayed. Bridge: {process.env.NEXT_PUBLIC_BRIDGE_BASE || 'http://127.0.0.1:8788'}
      </p>
    </main>
  );
}
