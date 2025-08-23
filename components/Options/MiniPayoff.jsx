// components/Options/MiniPayoff.jsx
"use client";
import { useMemo, useRef, useState } from "react";
import { breakEven } from "../../lib/quant/index.js";

export default function MiniPayoff({
  S0=100, K=100, premium=2, side="long", kind="call",
  width=460, height=160, className=""
}){
  const pad = 14, w = width, h = height;
  const zeroY = h/2 + 0.5; // visual balance

  const payoff = (S) => {
    if(kind==="call"){
      const core = Math.max(S-K,0);
      return side==="long" ? (core - premium) : (premium - core);
    }else{
      const core = Math.max(K-S,0);
      return side==="long" ? (core - premium) : (premium - core);
    }
  };

  const {xMin,xMax} = useMemo(()=>{
    const lo = Math.min(S0*0.6, K*0.7), hi = Math.max(S0*1.6, K*1.3);
    return { xMin: Math.max(0.01, lo), xMax: hi };
  },[S0,K]);

  const pts = useMemo(()=>{
    const N = 120;
    const xs = Array.from({length:N},(_,i)=> xMin + (i/(N-1))*(xMax-xMin));
    const vals = xs.map((x)=> payoff(x));
    const yMin = Math.min(...vals), yMax = Math.max(...vals);
    const yPad = (yMax - yMin) * 0.12 || 1;
    const ymn = yMin - yPad, ymx = yMax + yPad;

    const X = (x)=> pad + (x - xMin)/(xMax-xMin) * (w - 2*pad);
    const Y = (y)=> (h - pad) - (y - ymn)/(ymx-ymn) * (h - 2*pad);
    const path = xs.map((x,i)=> (i===0?"M":"L") + X(x) + " " + Y(vals[i])).join(" ");

    return { path, X, Y, ymn, ymx };
  },[xMin,xMax,payoff,w,h]);

  // BE
  const BE = useMemo(
    () => breakEven({ type: kind, K, premium }),
    [kind, K, premium]
  );

  // tooltip
  const [tip,setTip] = useState(null);
  const svgRef = useRef(null);
  const onMove = (e)=>{
    const svg = svgRef.current; if(!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const t = (x - pad) / (w - 2*pad);
    const S = xMin + clamp(t,0,1)*(xMax - xMin);
    const y = payoff(S);
    setTip({x, yPix: pts.Y(y), S, y});
  };
  const clamp=(v,a,b)=> Math.max(a, Math.min(b,v));

  return (
    <div className={`mini ${className}`}>
      <svg ref={svgRef} width={w} height={h} onMouseMove={onMove} onMouseLeave={()=>setTip(null)}>
        {/* zero line */}
        <line x1={pad} x2={w-pad} y1={zeroY} y2={zeroY} stroke="var(--border)" strokeDasharray="4 4" />
        {/* strike */}
        <line x1={pts.X(K)} x2={pts.X(K)} y1={pad} y2={h-pad} stroke="var(--border)" opacity="0.6"/>
        {/* path */}
        <path d={pts.path} fill="none" stroke="var(--text)" strokeWidth="1.8" opacity="0.9"/>
        {/* BE marker */}
        {Number.isFinite(BE) && (
          <>
            <circle cx={pts.X(BE)} cy={pts.Y(0)} r="4" fill="var(--accent, #3b82f6)" />
            <text x={pts.X(BE)+6} y={pts.Y(0)-6} fontSize="10" fill="var(--text)" opacity="0.85">BE</text>
          </>
        )}
        {/* tooltip */}
        {tip && (
          <>
            <line x1={tip.x} x2={tip.x} y1={pad} y2={h-pad} stroke="var(--border)" />
            <circle cx={tip.x} cy={tip.yPix} r="3.5" fill="var(--text)"/>
            <rect x={Math.min(w-pad-110, Math.max(pad, tip.x+8))} y={pad} width="108" height="38" rx="8" fill="var(--card)" stroke="var(--border)"/>
            <text x={Math.min(w-pad-104, Math.max(pad+6, tip.x+14))} y={pad+16} fontSize="11" fill="var(--text)" opacity="0.9">
              S ≈ {tip.S.toFixed(2)}
            </text>
            <text x={Math.min(w-pad-104, Math.max(pad+6, tip.x+14))} y={pad+30} fontSize="11" fill="var(--text)" opacity="0.9">
              P/L ≈ {tip.y.toFixed(2)}
            </text>
          </>
        )}
      </svg>
      <style jsx>{`
        .mini{ width:100%; overflow:hidden; border-radius:12px; }
        :global(svg text){ font-family: ui-sans-serif, system-ui, -apple-system, "SF Pro", Inter, Roboto, "Helvetica Neue", Arial; }
      `}</style>
    </div>
  );
}
