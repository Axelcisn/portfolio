// components/Strategy/Chart.jsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

/* ---------- math (BS & normal) ---------- */
const INV_SQRT_2PI = 1 / Math.sqrt(2 * Math.PI);
const erf = (x) => {
  const s = x < 0 ? -1 : 1; x = Math.abs(x);
  const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911;
  const t = 1/(1+p*x);
  return s*(1-(((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-x*x));
};
const normCdf = (x) => 0.5*(1+erf(x/Math.SQRT2));
const normPdf = (x) => INV_SQRT_2PI*Math.exp(-0.5*x*x);

function d1(S,K,r,sg,T){ if(!(S>0&&K>0&&sg>0&&T>0)) return 0; return (Math.log(S/K)+(r+0.5*sg*sg)*T)/(sg*Math.sqrt(T)); }
const d2 = (d1v,sg,T)=> d1v - sg*Math.sqrt(T);

function bsPrice({S,K,r,sigma,T,type}) {
  if(!(S>0&&K>0)) return 0;
  if(!(sigma>0&&T>0)) return type==="call"?Math.max(S-K,0):Math.max(K-S,0);
  const _d1=d1(S,K,r,sigma,T), _d2=d2(_d1,sigma,T);
  return type==="call"
    ? S*normCdf(_d1)-K*Math.exp(-r*T)*normCdf(_d2)
    : K*Math.exp(-r*T)*normCdf(-_d2)-S*normCdf(-_d1);
}
function greek({which,S,K,r,sigma,T,type}) {
  const _d1=d1(S,K,r,sigma,T), _d2=d2(_d1,sigma,T), phi=normPdf(_d1);
  switch(which){
    case "delta": return type==="call"?normCdf(_d1):normCdf(_d1)-1;
    case "gamma": return (phi/(S*sigma*Math.sqrt(T)))||0;
    case "vega":  return S*phi*Math.sqrt(T);
    case "theta": {
      const t1 = -(S*phi*sigma)/(2*Math.sqrt(T));
      const t2 = type==="call"?-r*K*Math.exp(-r*T)*normCdf(_d2):r*K*Math.exp(-r*T)*normCdf(-_d2);
      return t1+t2;
    }
    case "rho":   return type==="call"? K*T*Math.exp(-r*T)*normCdf(_d2) : -K*T*Math.exp(-r*T)*normCdf(-_d2);
    default: return 0;
  }
}

/* ---------- utils ---------- */
function lin([d0,d1],[r0,r1]){ const m=(r1-r0)/(d1-d0), b=r0-m*d0; const f=(x)=>m*x+b; f.invert=(y)=>(y-b)/m; return f; }
function tickStep(min,max,count){ const span=Math.max(1e-9,max-min); const step=Math.pow(10,Math.floor(Math.log10(span/count))); const err=span/(count*step); return step*(err>=7.5?10:err>=3?5:err>=1.5?2:1); }
function ticks(min,max,count=6){ const st=tickStep(min,max,count), start=Math.ceil(min/st)*st, out=[]; for(let v=start; v<=max+1e-9; v+=st) out.push(v); return out; }
const fmtNum=(x,d=2)=>Number.isFinite(x)?Number(x).toFixed(d):"—";
const fmtPct=(x,d=2)=>Number.isFinite(x)?`${(x*100).toFixed(d)}%`:"—";

/* ---------- position definitions ---------- */
const TYPE_INFO = {
  lc:{sign:+1,opt:"call"}, sc:{sign:-1,opt:"call"},
  lp:{sign:+1,opt:"put"},  sp:{sign:-1,opt:"put"},
  ls:{sign:+1,stock:true}, ss:{sign:-1,stock:true},
};
function rowsFromLegs(legs,days=30){
  const out=[], push=(k,t)=>{ const L=legs?.[k]; if(!L) return; if(!Number.isFinite(L.K)||!Number.isFinite(L.qty)) return;
    out.push({id:k,type:t,K:+L.K,qty:+L.qty,premium:Number.isFinite(L.premium)?+L.premium:null,days,enabled:!!L.enabled});
  };
  push("lc","lc"); push("sc","sc"); push("lp","lp"); push("sp","sp"); return out;
}

/* --------- payoff / greek aggregation --------- */
function payoffAtExpiration(S, rows, contractSize){
  let y=0;
  for(const r of rows){
    if(!r?.enabled) continue;
    const info=TYPE_INFO[r.type]; if(!info) continue;
    const q=Number(r.qty||0)*contractSize;
    if(info.stock){ y += info.sign*(S-Number(r.K||0))*q; continue; }
    const K=Number(r.K||0), prem=Number.isFinite(r.premium)?Number(r.premium):0;
    const intr = info.opt==="call"?Math.max(S-K,0):Math.max(K-S,0);
    y += info.sign*intr*q + (-info.sign)*prem*q;
  }
  return y;
}
function payoffCurrent(S, rows, {r,sigma}, contractSize){
  let y=0;
  for(const r0 of rows){
    if(!r0?.enabled) continue;
    const info=TYPE_INFO[r0.type]; if(!info) continue;
    const q=Number(r0.qty||0)*contractSize;
    if(info.stock){ y += info.sign*(S-Number(r0.K||0))*q; continue; }
    const K=Number(r0.K||0), T=Math.max(1,Number(r0.days||0))/365;
    const prem=Number.isFinite(r0.premium)?Number(r0.premium):0;
    const px=bsPrice({S,K,r,sigma,T,type:info.opt});
    y += info.sign*px*q + (-info.sign)*prem*q;
  }
  return y;
}
function greekTotal(which,S,rows,{r,sigma},contractSize){
  let g=0;
  for(const r0 of rows){
    if(!r0?.enabled) continue;
    const info=TYPE_INFO[r0.type]; if(!info) continue;
    const q=Number(r0.qty||0)*contractSize;
    if(info.stock){ if(which==="delta") g+=info.sign*q; continue; }
    const K=Number(r0.K||0), T=Math.max(1,Number(r0.days||0))/365;
    const g1=greek({which,S,K,r,sigma,T,type:info.opt});
    g += (info.sign>0?+1:-1)*g1*q;
  }
  return g;
}

/* ---------- build area polygons between y=0 and yExp ---------- */
function buildAreaPaths(xs, ys, xScale, yScale){
  const pos=[], neg=[];
  const eps = 1e-9;
  let seg=null, sign=0;

  const push = () => {
    if(!seg || seg.length<3) { seg=null; return; }
    const d = seg.map((p,i)=>`${i?'L':'M'}${xScale(p[0])},${yScale(p[1])}`).join(" ") + " Z";
    (sign>0?pos:neg).push(d);
    seg=null; sign=0;
  };

  for(let i=0;i<xs.length;i++){
    const x=xs[i], y=ys[i];
    const s = y>eps?1:y<-eps?-1:0;

    if(i>0){
      const y0=ys[i-1], s0=y0>eps?1:y0<-eps?-1:0;
      if(s!==s0){
        const x0=xs[i-1], dy=y-y0;
        const xCross = dy===0 ? x : x0 + (0 - y0) * (x - x0) / dy;
        if(seg){ seg.push([xCross,0]); push(); }
        if(s!==0){ seg=[[xCross,0],[x,y]]; sign=s; continue; }
        else { seg=null; sign=0; continue; }
      }
    }

    if(s===0){ if(seg){ seg.push([x,0]); push(); } }
    else {
      if(!seg){ seg=[[x,0]]; sign=s; }
      seg.push([x,y]);
    }
  }
  if(seg){ seg.push([xs[xs.length-1],0]); push(); }
  return { pos, neg };
}

/* ---------- constants ---------- */
const GREEK_LABEL = { vega:"Vega", delta:"Delta", gamma:"Gamma", theta:"Theta", rho:"Rho" };
const GREEK_COLOR = { vega:"#f59e0b", delta:"#f59e0b", gamma:"#f59e0b", theta:"#f59e0b", rho:"#f59e0b" }; // same color, easy to theme
const Z975 = 1.959963984540054;

/* ---------- component ---------- */
export default function Chart({
  spot=null,
  currency="USD",
  rows=null,        // new builder rows
  legs=null,        // legacy
  riskFree=0.02, sigma=0.2, T=30/365,
  greek: greekProp, onGreekChange,
  onLegsChange,
  contractSize=1,
  showControls=true,
  frameless=false,
}) {
  /* ---- normalize rows (keep your previous logic) ---- */
  const rowsEff = useMemo(() => {
    if (rows && Array.isArray(rows)) return rows;
    const days = Math.max(1, Math.round((T || 30/365)*365));
    return rowsFromLegs(legs, days);
  }, [rows, legs, T]);

  /* ---- domain & zoom (centered, no panning) ---- */
  const ks = useMemo(() => rowsEff.filter(r=>Number.isFinite(r?.K)).map(r=>+r.K).sort((a,b)=>a-b), [rowsEff]);
  const baseDomain = useMemo(() => {
    const s = Number(spot) || (ks[0] ?? 100);
    const lo = Math.max(0.01, Math.min(ks[0] ?? s, s) * 0.9);
    const hi = Math.max(lo * 1.1, Math.max(ks[ks.length-1] ?? s, s) * 1.1);
    return [lo, hi];
  }, [spot, ks]);

  const centerStrike = useMemo(() =>
    ks.length ? (ks[0]+ks[ks.length-1])/2 : (Number(spot)||baseDomain[0]),
  [ks, spot, baseDomain]);

  const [zoom, setZoom] = useState(1); // 1 == base, >1 zoom in
  const xDomain = useMemo(() => {
    const [lo,hi]=baseDomain; const span=hi-lo;
    const factor = Math.max(1, Math.min(8, zoom)); // clamp
    const newSpan = span / factor;
    const c = centerStrike;
    return [Math.max(0.01, c - newSpan/2), c + newSpan/2];
  }, [baseDomain, centerStrike, zoom]);

  const zoomIn  = ()=> setZoom(z => Math.min(8, z*1.12));
  const zoomOut = ()=> setZoom(z => Math.max(1, z/1.12));
  const zoomReset = ()=> setZoom(1);

  /* ---- sample X ---- */
  const N=401;
  const xs = useMemo(() => {
    const [lo,hi]=xDomain, step=(hi-lo)/(N-1); const arr=new Array(N);
    for(let i=0;i<N;i++) arr[i]=lo+i*step;
    return arr;
  }, [xDomain]);

  /* ---- curves ---- */
  const env = useMemo(()=>({r:riskFree, sigma}), [riskFree, sigma]);
  const yExp = useMemo(()=>xs.map(S=>payoffAtExpiration(S, rowsEff, contractSize)), [xs, rowsEff, contractSize]);
  const yNow = useMemo(()=>xs.map(S=>payoffCurrent(S, rowsEff, env, contractSize)), [xs, rowsEff, env, contractSize]);

  const whichGreek=(greekProp||"vega").toLowerCase();
  const gVals = useMemo(()=>xs.map(S=>greekTotal(whichGreek, S, rowsEff, env, contractSize)), [xs, rowsEff, env, contractSize, whichGreek]);

  /* ---- break-evens ---- */
  const be = useMemo(()=>{
    const out=[]; for(let i=1;i<xs.length;i++){ const y0=yExp[i-1], y1=yExp[i];
      if((y0>0&&y1<0)||(y0<0&&y1>0)){ const t=(-y0)/(y1-y0); out.push(xs[i-1]+t*(xs[i]-xs[i-1])); }
    }
    return Array.from(new Set(out.map(v=>+v.toFixed(6)))).sort((a,b)=>a-b);
  }, [xs, yExp]);

  /* ---- layout / scales ---- */
  const ref=useRef(null);
  const [w,setW]=useState(900);
  useEffect(()=>{ const ro=new ResizeObserver(es=>{ const cr=es[0]?.contentRect; if(cr?.width) setW(Math.max(640,cr.width));}); if(ref.current) ro.observe(ref.current); return ()=>ro.disconnect();},[]);
  const pad={l:56,r:56,t:30,b:40}; const innerW=Math.max(10,w-pad.l-pad.r); const h=440, innerH=h-pad.t-pad.b;

  const yRange = useMemo(()=>{ const lo=Math.min(0,...yExp,...yNow), hi=Math.max(0,...yExp,...yNow); return [lo, hi===lo?lo+1:hi]; }, [yExp,yNow]);

  const xScale = useMemo(()=>lin(xDomain,[pad.l,pad.l+innerW]),[xDomain,innerW]);
  const yScale = useMemo(()=>lin([yRange[0],yRange[1]],[pad.t+innerH,pad.t]),[yRange,innerH]);

  // right Greek axis
  const gMin=Math.min(...gVals), gMax=Math.max(...gVals), gPad=(gMax-gMin)*0.1||1;
  const gRange=[gMin-gPad,gMax+gPad];
  const gScale = useMemo(()=>lin(gRange,[pad.t+innerH,pad.t]),[gRange,innerH]);

  const xTicks = ticks(xDomain[0], xDomain[1], 7);
  const yTicks = ticks(yRange[0], yRange[1], 6);
  const gTicks = ticks(gRange[0], gRange[1], 6);

  // precise P/L shading
  const { pos:posPaths, neg:negPaths } = useMemo(
    ()=>buildAreaPaths(xs, yExp, xScale, yScale),
    [xs, yExp, xScale, yScale]
  );

  /* ---- lognormal PDF & CDF (for probabilities) ---- */
  const avgDays = useMemo(()=> {
    const opt = rowsEff.filter(r=>!TYPE_INFO[r.type]?.stock && Number.isFinite(r.days));
    if(!opt.length) return Math.round(T*365)||30;
    return Math.round(opt.reduce((s,r)=>s+Number(r.days||0),0)/opt.length);
  }, [rowsEff,T]);
  const mu=riskFree, sVol=sigma, Tyrs=Math.max(1,avgDays)/365;
  const m = Math.log(Math.max(1e-9, Number(spot||xs[0]))) + (mu-0.5*sVol*sVol)*Tyrs;
  const sLn = sVol*Math.sqrt(Tyrs);
  const lognormPdf = (x)=>x>0?(1/(x*sLn*Math.sqrt(2*Math.PI)))*Math.exp(-Math.pow(Math.log(x)-m,2)/(2*sLn*sLn)):0;
  const cdfVal = (x)=> normCdf((Math.log(Math.max(x,1e-9))-m)/sLn);

  /* ---- analytic GBM quantiles (95% CI & mean) ---- */
  const S0 = Number(spot || ks[0] || xDomain[0]);
  const volT = sVol*Math.sqrt(Tyrs);
  const driftT = (mu)*Tyrs;
  const ciLow  = S0 * Math.exp(driftT - volT * Z975);
  const ciHigh = S0 * Math.exp(driftT + volT * Z975);
  const meanPrice = S0 * Math.exp(mu * Tyrs); // E[S_T] under drift mu

  /* ---- metrics ---- */
  const lotSize = useMemo(()=>rowsEff.reduce((s,r)=>s+Math.abs(Number(r.qty||0)),0)||1,[rowsEff]);

  /* ---- tooltip (solid, compact) ---- */
  const [tState,setTState]=useState({show:false, x:0, idx:0});
  const onMove=(e)=>{
    const rect=e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const sVal = xScale.invert(px);
    // nearest index
    let lo=0, hi=xs.length-1;
    while(hi-lo>1){ const mi=(lo+hi)>>1; (xs[mi]<sVal)?(lo=mi):(hi=mi); }
    const idx = (sVal-xs[lo] < xs[hi]-sVal)?lo:hi;
    setTState({show:true, x:px, idx});
  };
  const onLeave=()=>setTState(s=>({...s,show:false}));

  const tIdx = Math.max(0, Math.min(xs.length-1, tState.idx));
  const tS   = xs[tIdx];
  const tNow = yNow[tIdx];
  const tExp = yExp[tIdx];
  const tG   = gVals[tIdx];
  const pLeft  = cdfVal(tS);
  const pRight = 1 - pLeft;

  const greekColor = GREEK_COLOR[whichGreek] || "#f59e0b";

  const Wrapper=frameless?"div":"section"; const wrapClass=frameless?"chart-wrap":"card chart-wrap";

  return (
    <Wrapper className={wrapClass} ref={ref}>
      {/* header */}
      <div className="chart-header">
        <div className="legend">
          <div className="leg"><span className="sw" style={{ borderColor: "var(--accent)" }} />Current P&L</div>
          <div className="leg"><span className="sw" style={{ borderColor: "var(--text-muted,#8a8a8a)" }} />Expiration P&L</div>
          <div className="leg"><span className="sw dash" style={{ borderColor: greekColor }} />{GREEK_LABEL[whichGreek]||"Greek"}</div>
        </div>
        <div className="header-tools">
          <div className="greek-ctl">
            <label className="small muted" htmlFor="greek">Greek</label>
            <select id="greek" value={whichGreek} onChange={(e)=>onGreekChange?.(e.target.value)}>
              <option value="vega">Vega</option><option value="delta">Delta</option><option value="gamma">Gamma</option><option value="theta">Theta</option><option value="rho">Rho</option>
            </select>
          </div>
          <div className="zoom">
            <button aria-label="Zoom out" onClick={zoomOut}>−</button>
            <button aria-label="Zoom in"  onClick={zoomIn}>+</button>
            <button aria-label="Reset zoom" onClick={zoomReset}>⟲</button>
          </div>
        </div>
      </div>

      {/* chart */}
      <svg
        width="100%"
        height={h}
        role="img"
        aria-label="Strategy payoff chart"
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        style={{ touchAction:"none" }}
      >
        {/* shaded profit/loss areas */}
        {negPaths.map((d,i)=><path key={`neg-${i}`} d={d} fill="rgba(239,68,68,.10)" stroke="none" />)}
        {posPaths.map((d,i)=><path key={`pos-${i}`} d={d} fill="rgba(16,185,129,.12)" stroke="none" />)}

        {/* grid */}
        {xTicks.map((t,i)=><line key={`xg-${i}`} x1={xScale(t)} x2={xScale(t)} y1={pad.t} y2={pad.t+innerH} stroke="var(--border)" strokeOpacity="0.6" />)}
        {yTicks.map((t,i)=><line key={`yg-${i}`} x1={pad.l} x2={pad.l+innerW} y1={yScale(t)} y2={yScale(t)} stroke="var(--border)" strokeOpacity="0.6" />)}

        {/* axes labels & guide lines */}
        <line x1={pad.l} x2={pad.l+innerW} y1={yScale(0)} y2={yScale(0)} stroke="var(--text)" strokeOpacity="0.8" />
        {yTicks.map((t,i)=>(<g key={`yl-${i}`}><line x1={pad.l-4} x2={pad.l} y1={yScale(t)} y2={yScale(t)} stroke="var(--text)" /><text x={pad.l-8} y={yScale(t)} dy="0.32em" textAnchor="end" className="tick">{fmtNum(t)}</text></g>))}
        {xTicks.map((t,i)=>(<g key={`xl-${i}`}><line x1={xScale(t)} x2={xScale(t)} y1={pad.t+innerH} y2={pad.t+innerH+4} stroke="var(--text)" /><text x={xScale(t)} y={pad.t+innerH+16} textAnchor="middle" className="tick">{fmtNum(t,0)}</text></g>))}

        {/* right Greek axis */}
        {gTicks.map((t,i)=>(
          <g key={`gr-${i}`}>
            <line x1={pad.l+innerW} x2={pad.l+innerW+4} y1={gScale(t)} y2={gScale(t)} stroke={greekColor} strokeOpacity="0.9" />
            <text x={pad.l+innerW+8} y={gScale(t)} dy="0.32em" textAnchor="start" className="tick" style={{ fill: greekColor }}>{fmtNum(t)}</text>
          </g>
        ))}
        <text transform={`translate(${w-14} ${pad.t+innerH/2}) rotate(90)`} textAnchor="middle" className="axis" style={{ fill: greekColor }}>
          {GREEK_LABEL[whichGreek]||"Greek"}
        </text>

        {/* reference lines: spot, CI & mean */}
        {Number.isFinite(spot) && (
          <line x1={xScale(spot)} x2={xScale(spot)} y1={pad.t} y2={pad.t+innerH} stroke="#67e8f9" strokeDasharray="4 6" strokeOpacity="0.9" />
        )}
        <line x1={xScale(ciLow)}  x2={xScale(ciLow)}  y1={pad.t} y2={pad.t+innerH} stroke="#a855f7" strokeDasharray="6 6" strokeOpacity="0.9" />
        <line x1={xScale(ciHigh)} x2={xScale(ciHigh)} y1={pad.t} y2={pad.t+innerH} stroke="#a855f7" strokeDasharray="6 6" strokeOpacity="0.9" />
        <line x1={xScale(meanPrice)} x2={xScale(meanPrice)} y1={pad.t} y2={pad.t+innerH} stroke="#ec4899" strokeDasharray="4 4" strokeOpacity="0.9" />

        {/* series */}
        <path d={xs.map((v,i)=>`${i?'L':'M'}${xScale(v)},${yScale(yNow[i])}`).join(" ")} fill="none" stroke="var(--accent)" strokeWidth="2.2" />
        <path d={xs.map((v,i)=>`${i?'L':'M'}${xScale(v)},${yScale(yExp[i])}`).join(" ")} fill="none" stroke="var(--text-muted,#8a8a8a)" strokeWidth="2" />
        <path d={xs.map((v,i)=>`${i?'L':'M'}${xScale(v)},${gScale(gVals[i])}`).join(" ")} fill="none" stroke={greekColor} strokeWidth="2" strokeDasharray="6 6" />

        {/* break-evens */}
        {be.map((b,i)=>(<g key={`be-${i}`}><line x1={xScale(b)} x2={xScale(b)} y1={pad.t} y2={pad.t+innerH} stroke="var(--text)" strokeOpacity="0.25" /><circle cx={xScale(b)} cy={yScale(0)} r="3.5" fill="var(--bg,#111)" stroke="var(--text)" /></g>))}

        {/* axes titles (bottom & left) */}
        <text x={pad.l+innerW/2} y={pad.t+innerH+32} textAnchor="middle" className="axis">Underlying price</text>
        <text transform={`translate(14 ${pad.t+innerH/2}) rotate(-90)`} textAnchor="middle" className="axis">P/L</text>

        {/* hover tooltip */}
        {tState.show && (
          <g>
            <line x1={pad.l} x2={pad.l+innerW} y1={yScale(0)} y2={yScale(0)} stroke="var(--text)" strokeOpacity="0.15" />
            <line x1={xScale(tS)} x2={xScale(tS)} y1={pad.t} y2={pad.t+innerH} stroke="var(--text)" strokeOpacity="0.2" strokeDasharray="3 6" />
            {/* panel */}
            {(() => {
              const panelW = 220, panelH = 120;
              const px = Math.min(pad.l+innerW-panelW-6, Math.max(pad.l+6, xScale(tS)-panelW/2));
              const py = pad.t + 12;
              return (
                <g transform={`translate(${px} ${py})`}>
                  <rect width={panelW} height={panelH} rx="10" ry="10" fill="rgba(24,24,28,1)" stroke="rgba(255,255,255,.12)" />
                  <g transform="translate(12 12)" fontSize="11" fill="var(--text)">
                    <g>
                      <circle cx="4" cy="4" r="4" fill="var(--accent)" />
                      <text x="14" y="6" dominantBaseline="middle">Current P&amp;L</text>
                      <text x={panelW-24} y="6" textAnchor="end">{fmtNum(tNow,2)} USD</text>
                    </g>
                    <g transform="translate(0 18)">
                      <circle cx="4" cy="4" r="4" fill="var(--text-muted,#8a8a8a)" />
                      <text x="14" y="6" dominantBaseline="middle">Expiration P&amp;L</text>
                      <text x={panelW-24} y="6" textAnchor="end">{fmtNum(tExp,2)} USD</text>
                    </g>
                    <g transform="translate(0 36)">
                      <circle cx="4" cy="4" r="4" fill={greekColor} />
                      <text x="14" y="6" dominantBaseline="middle">{GREEK_LABEL[whichGreek]}</text>
                      <text x={panelW-24} y="6" textAnchor="end">{fmtNum(tG,2)}</text>
                    </g>

                    <line x1="0" x2={panelW-24} y1="56" y2="56" stroke="rgba(255,255,255,.12)" />
                    <text x={(panelW-24)/2} y="70" textAnchor="middle" fontSize="12" opacity="0.85">
                      Underlying price
                    </text>
                    <text x={(panelW-24)/2} y="86" textAnchor="middle" fontSize="12" fontWeight="700">{fmtNum(tS,2)} USD</text>

                    <text x={(panelW-24)/2} y="104" textAnchor="middle" fontSize="12" opacity="0.85">
                      Probability
                    </text>
                  </g>
                  <g transform={`translate(${12} ${12+90})`} fontSize="12" fill="var(--text)">
                    <text x="0" y="0" />
                    <text x="8" y="0">{fmtPct(pLeft,1)}</text>
                    <text x={panelW/2 - 8} y="0" textAnchor="middle">•</text>
                    <text x={panelW-36} y="0" textAnchor="end">{fmtPct(pRight,1)}</text>
                  </g>
                </g>
              );
            })()}
          </g>
        )}
      </svg>

      {/* metrics */}
      <div className="metrics">
        <div className="m"><div className="k">Underlying price</div><div className="v">{Number.isFinite(spot)?Number(spot).toFixed(2):"—"}</div></div>
        <div className="m"><div className="k">Max profit</div><div className="v">{fmtNum(Math.max(...yExp),2)}</div></div>
        <div className="m"><div className="k">Max loss</div><div className="v">{fmtNum(Math.min(...yExp),2)}</div></div>
        <div className="m"><div className="k">Win rate</div><div className="v">{fmtPct(useMemo(()=>{let m=0,t=0;for(let i=1;i<xs.length;i++){const xm=.5*(xs[i]+xs[i-1]);const p=lognormPdf(xm);const y=.5*(yExp[i]+yExp[i-1]);const dx=xs[i]-xs[i-1];t+=p*dx;if(y>0)m+=p*dx;}return t>0?m/t:NaN;},[xs,yExp]),2)}</div></div>
        <div className="m"><div className="k">Breakeven</div><div className="v">{be.length===0?"—":be.length===1?fmtNum(be[0],2):`${fmtNum(be[0],0)} | ${fmtNum(be[1],0)}`}</div></div>
        <div className="m"><div className="k">Lot size</div><div className="v">{lotSize}</div></div>
      </div>

      <style jsx>{`
        .chart-wrap{ display:block; }
        .chart-header{ display:flex; align-items:center; justify-content:space-between; gap:12px; padding:8px 6px 2px; }
        .legend{ display:flex; gap:14px; flex-wrap:wrap; }
        .leg{ display:inline-flex; align-items:center; gap:8px; font-size:12.5px; opacity:.9; }
        .sw{ width:18px; height:0; border-top:2px solid; border-radius:2px; }
        .sw.dash{ border-style:dashed; }
        .header-tools{ display:flex; align-items:center; gap:10px; }
        .greek-ctl{ display:flex; align-items:center; gap:8px; }
        .greek-ctl select{ height:28px; border-radius:8px; border:1px solid var(--border); background:var(--bg); color:var(--text); padding:0 8px; }

        .zoom{ display:flex; align-items:center; gap:6px; }
        .zoom button{
          width:28px; height:28px; border-radius:8px;
          border:1px solid var(--border); background:var(--bg); color:var(--text);
          font-weight:700; line-height:1;
        }
        .zoom button:hover{ background:var(--card); }

        .tick{ font-size:11px; fill:var(--text); opacity:.75; }
        .axis{ font-size:12px; fill:var(--text); opacity:.7; }

        .metrics{ display:grid; grid-template-columns: repeat(6, minmax(0,1fr)); gap:10px; padding:10px 6px 12px; border-top:1px solid var(--border); }
        .m .k{ font-size:12px; opacity:.7; } .m .v{ font-weight:700; }
        @media (max-width:920px){ .metrics{ grid-template-columns: repeat(3, minmax(0,1fr)); } }
      `}</style>
    </Wrapper>
  );
}
