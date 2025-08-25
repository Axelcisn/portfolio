'use client';
import React from 'react';
import QuoteCard from '@/components/QuoteCard';
import PriceSparkline from '@/components/PriceSparkline';
import OptionChainTable from '@/components/OptionChainTable';

export default function HomePage() {
  const [symbol, setSymbol] = React.useState('AAPL');
  const [win, setWin] = React.useState(3);

  return (
    <main style={{padding:'20px', maxWidth:'1200px', margin:'0 auto', fontFamily:'system-ui,-apple-system,Segoe UI,Roboto,sans-serif'}}>
      <h1 style={{fontSize:24, fontWeight:700, marginBottom:12}}>IB Options — Quote & Chain</h1>

      <div style={{display:'flex', gap:12, alignItems:'center', margin:'8px 0 16px 0'}}>
        <label>Symbol:
          <input value={symbol} onChange={e=>setSymbol(e.target.value.toUpperCase())}
                 style={{marginLeft:6, padding:6, border:'1px solid #ddd', borderRadius:6}} />
        </label>
        <label>Window:
          <select value={win} onChange={e=>setWin(parseInt(e.target.value))}
                  style={{marginLeft:6, padding:6, border:'1px solid #ddd', borderRadius:6}}>
            {[2,3,4,5,6,8].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <span style={{fontSize:12, color:'#666'}}>Bridge: {process.env.NEXT_PUBLIC_BRIDGE_BASE || 'http://127.0.0.1:8788'}</span>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
        <QuoteCard symbol={symbol} />
        <div style={{border:'1px solid #eee', borderRadius:8, padding:8, background:'#fff'}}>
          <PriceSparkline symbol={symbol} />
        </div>
      </div>

      <div style={{marginTop:12}}>
        <OptionChainTable symbol={symbol} windowSize={win} />
      </div>

      <p style={{marginTop:12, color:'#666', fontSize:12}}>Data is delayed (no paid subs). Powered by local TWS bridge.</p>
    </main>
  );
}
