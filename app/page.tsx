'use client';

import React from 'react';
import QuoteCard from '../components/QuoteCard';
import OptionChainTable from '../components/OptionChainTable';

export default function HomePage() {
  const [symbol, setSymbol] = React.useState('AAPL');
  const base = process.env.NEXT_PUBLIC_BRIDGE_BASE || 'http://127.0.0.1:8788';

  return (
    <main style={{padding:'20px', maxWidth:'1100px', margin:'0 auto', fontFamily:'system-ui,-apple-system,Segoe UI,Roboto,sans-serif'}}>
      <h1 style={{fontSize:24, fontWeight:700, marginBottom:12}}>IB UI — Quotes & Option Chain</h1>

      <div style={{display:'flex', gap:12, alignItems:'center', margin:'8px 0 16px 0'}}>
        <label>Symbol:
          <input
            value={symbol}
            onChange={e=>setSymbol(e.target.value.toUpperCase())}
            style={{marginLeft:6, padding:6, border:'1px solid #ddd', borderRadius:6}}
          />
        </label>
        <span style={{fontSize:12, color:'#666'}}>Bridge: {base}</span>
      </div>

      <section>
        <QuoteCard symbol={symbol} />
      </section>

      <div style={{marginTop:16}}>
        <OptionChainTable symbol={symbol} />
      </div>

      <p style={{marginTop:12,color:'#666',fontSize:12}}>
        Data is delayed (no live market‑data subs). Backend: TWS Bridge.
      </p>
    </main>
  );
}
