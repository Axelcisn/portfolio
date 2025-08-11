// components/Strategy/StrategyModal.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DirectionBadge from "./DirectionBadge";

/* =========================
   Helpers
   ========================= */

// Legs dictionary + sign convention (Short +, Long −) for premiums and Greeks
const POS_MAP = {
  "Long Call": { key: "lc", sign: -1, type: "call" },
  "Short Call": { key: "sc", sign: +1, type: "call" },
  "Long Put": { key: "lp", sign: -1, type: "put" },
  "Short Put": { key: "sp", sign: +1, type: "put" },
};

const clamp = (x, a, b) => Math.min(Math.max(Number(x) || 0, a), b);
const median = (xs) => {
  const a = xs.slice().sort((p, q) => p - q);
  const m = Math.floor(a.length / 2);
  return a.length ? (a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2) : NaN;
};

const fmtCur = (v, ccy = "USD") => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: ccy,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    const sign = ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : "$";
    return sign + n.toFixed(2);
  }
};

function toChartLegs(rows) {
  const empty = { enabled: false, K: NaN, qty: 0 };
  const obj = { lc: { ...empty }, sc: { ...empty }, lp: { ...empty }, sp: { ...empty } };
  rows.forEach((r) => {
    const map = POS_MAP[r.position];
    if (!map) return;
    const qty = Number(r.volume || 0);
    const k = Number(r.strike);
    if (!Number.isFinite(qty) || !Number.isFinite(k)) return;
    obj[map.key] = { enabled: qty > 0, K: k, qty };
  });
  return obj;
}

function netPremium(rows) {
  let sum = 0;
  rows.forEach((r) => {
    const map = POS_MAP[r.position];
    if (!map) return;
    const vol = Number(r.volume || 0);
    const prem = Number(r.premium || 0);
    if (Number.isFinite(vol) && Number.isFinite(prem)) {
      // short collects (+), long pays (−)
      sum += map.sign * vol * prem;
    }
  });
  return sum;
}

/* =========================
   Black–Scholes Greeks (annualized)
   ========================= */
const sqrt = Math.sqrt;
const exp = Math.exp;
const log = Math.log;
const PI2 = Math.sqrt(2 * Math.PI);

function _pdf(x) { return Math.exp(-0.5 * x * x) / PI2; }
function _cdf(x) {
  // Abramowitz–Stegun approximation
  const k = 1 / (1 + 0.2316419 * Math.abs(x));
  const a1 = 0.319381530, a2 = -0.356563782, a3 = 1.781477937, a4 = -1.821255978, a5 = 1.330274429;
  const poly = ((((a5 * k + a4) * k + a3) * k + a2) * k + a1) * k;
  const w = 1 - _pdf(x) * poly;
  return x < 0 ? 1 - w : w;
}

function d1(S, K, r, v, T){ return (Math.log(S / K) + (r + 0.5 * v * v) * T) / (v * Math.sqrt(T)); }
function d2(S, K, r, v, T){ return d1(S, K, r, v, T) - v * Math.sqrt(T); }

function greeksOne(S, K, r, v, T, type){
  if (!(S>0) || !(K>0) || !(v>0) || !(T>0)) return { delta:0,gamma:0,vega:0,theta:0,rho:0 };
  const _d1 = d1(S,K,r,v,T), _d2 = _d1 - v * sqrt(T);
  const pdf = _pdf(_d1), Nd1 = _cdf(type==="call"?_d1:-_d1), Nd2 = _cdf(type==="call"?_d2:-_d2);
  const delta = type==="call" ? _cdf(_d1) : _cdf(_d1) - 1;
  const gamma = pdf/(S*v*sqrt(T));
  const vega  = S*pdf*sqrt(T); // per 1.0 vol
  const thetaCall = -(S*pdf*v)/(2*sqrt(T)) - r*K*exp(-r*T)*_cdf(_d2);
  const thetaPut  = -(S*pdf*v)/(2*sqrt(T)) + r*K*exp(-r*T)*_cdf(-_d2);
  const theta = type==="call" ? thetaCall : thetaPut;
  const rho   = (type==="call" ? K*T*exp(-r*T)*_cdf(_d2) : -K*T*exp(-r*T)*_cdf(-_d2));
  return { delta, gamma, vega, theta, rho };
}

function aggregateGreeksAtS(S, rows, env, contractSize=100){
  const { riskFree=0, sigma=0.25, T=30/365 } = env || {};
  let g = { delta:0,gamma:0,vega:0,theta:0,rho:0 };
  for (const r of rows){
    const map = POS_MAP[r.position];
    if (!map || !Number.isFinite(r.strike) || !Number.isFinite(r.volume)) continue;
    const mult = map.sign * r.volume * contractSize;        // short +, long −  (your convention)
    const k = r.strike;
    const gg = greeksOne(S, k, riskFree, sigma, T, map.type);
    g.delta += mult * gg.delta;
    g.gamma += mult * gg.gamma;
    g.vega  += mult * gg.vega;
    g.theta += mult * gg.theta;
    g.rho   += mult * gg.rho;
  }
  return g;
}

/* =========================
   Lightweight SVG chart (no card/border)
   ========================= */
function useSize(ref, fallbackW = 960) {
  const [w, setW] = useState(fallbackW);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((es) => {
      for (const e of es) setW(Math.max(320, e.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return w;
}

function ChartCanvas({
  spot, rows, env, contractSize=100, greek="vega",
  height = 420, commission = 0
}){
  const wrapRef = useRef(null);
  const width = useSize(wrapRef);

  // strikes window
  const strikes = rows.map(r => Number(r.strike)).filter(Number.isFinite);
  const s = Number(spot);
  const minX = strikes.length ? Math.min(...strikes, s || Infinity) : (Number.isFinite(s)? s*0.8 : 180);
  const maxX = strikes.length ? Math.max(...strikes, s || -Infinity) : (Number.isFinite(s)? s*1.2 : 280);
  const P = { t: 18, r: 48, b: 44, l: 56 };
  const W = Math.max(40, width - P.l - P.r);
  const H = Math.max(60, height - P.t - P.b);

  const x = (v) => P.l + ((v - minX) / (maxX - minX)) * W;
  const yL = (v, minY=-0.08, maxY=0.08) => P.t + (1 - (v - minY) / (maxY - minY)) * H;

  // Placeholder payoff lines (flat for now; will replace in Step 3/4)
  const yMin = -0.08, yMax = 0.08;

  // Greek curve (right axis auto scaled)
  const Xs = Array.from({length: 160}, (_,i)=>minX + (i/(160-1))*(maxX-minX));
  const greekKey = greek?.toLowerCase();
  const gly = Xs.map(S_ => aggregateGreeksAtS(S_, rows, env, contractSize)[greekKey || "vega"] || 0);
  const gAbsMax = Math.max(1e-6, ...gly.map(v => Math.abs(v)));
  const yR = (v) => yL(v, -gAbsMax, gAbsMax);

  // central strike line (median of strikes, fallback to spot)
  const centerK = Number.isFinite(median(strikes)) ? median(strikes) : (Number.isFinite(s) ? s : (minX+maxX)/2);

  // simple win/loss background (temporary until real B/E): left red, right green
  const leftW = x(centerK) - P.l, rightW = (P.l+W) - x(centerK);

  return (
    <div ref={wrapRef} style={{ width: "100%" }}>
      <svg width={width} height={height} role="img" aria-label="Strategy payoff chart">
        {/* Background zones */}
        <rect x={P.l} y={P.t} width={leftW} height={H} fill="rgba(244,63,94,.06)" />
        <rect x={x(centerK)} y={P.t} width={rightW} height={H} fill="rgba(16,185,129,.06)" />

        {/* grid Y (left) */}
        {Array.from({ length: 6 + 1 }).map((_, i) => {
          const yy = P.t + (i / 6) * H;
          const val = yMax - (i / 6) * (yMax - yMin);
          return (
            <g key={`gy${i}`}>
              <line x1={P.l} y1={yy} x2={P.l+W} y2={yy} stroke="rgba(255,255,255,.08)" />
              <text x={P.l - 8} y={yy + 4} textAnchor="end" fontSize="10" fill="rgba(255,255,255,.60)">
                {val >= 0 ? `$ ${val.toFixed(2)}` : `-$ ${Math.abs(val).toFixed(2)}`}
              </text>
            </g>
          );
        })}

        {/* grid X */}
        {Array.from({ length: 8 + 1 }).map((_, i) => {
          const xx = P.l + (i / 8) * W;
          const val = minX + (i / 8) * (maxX - minX);
          return (
            <g key={`gx${i}`}>
              <line x1={xx} y1={P.t} x2={xx} y2={P.t+H} stroke="rgba(255,255,255,.06)" />
              <text x={xx} y={height - 12} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,.62)">
                {Math.round(val)}
              </text>
            </g>
          );
        })}

        {/* vertical guide at strike center */}
        <line x1={x(centerK)} y1={P.t} x2={x(centerK)} y2={P.t+H} stroke="rgba(255,255,255,.38)" strokeDasharray="4 4" />

        {/* Legends (left) */}
        <g transform={`translate(${P.l + 4}, ${P.t + 10})`}>
          <circle r="4" fill="#60a5fa" />
          <text x="8" y="3" fontSize="10" fill="rgba(255,255,255,.85)">Current P&amp;L</text>
          <circle cx="94" r="4" fill="#f472b6" />
          <text x="102" y="3" fontSize="10" fill="rgba(255,255,255,.85)">Expiration P&amp;L</text>
        </g>

        {/* Payoff placeholders (Step 3/4 will replace) */}
        <polyline fill="none" stroke="#60a5fa" strokeWidth="2"
          points={`${P.l},${yL(-0.015,yMin,yMax)} ${P.l+W},${yL(-0.015,yMin,yMax)}`} />
        <polyline fill="none" stroke="#f472b6" strokeWidth="2" strokeDasharray="4 3"
          points={`${P.l},${yL(-0.015,yMin,yMax)} ${P.l+W},${yL(-0.015,yMin,yMax)}`} />

        {/* Greek curve (right axis) */}
        {greekKey && (
          <>
            <polyline
              fill="none"
              stroke="#f59e0b"
              strokeWidth="2"
              strokeDasharray="6 5"
              points={Xs.map((S_,i)=>`${x(S_)},${yR(gly[i])}`).join(" ")}
            />
            {/* Right axis ticks */}
            {Array.from({length: 4+1}).map((_,i)=>{
              const v = gAbsMax - (i/4)*2*gAbsMax;
              const yy = yR(v);
              return (
                <g key={`ry${i}`}>
                  <line x1={P.l+W} y1={yy} x2={P.l+W+4} y2={yy} stroke="rgba(255,255,255,.25)" />
                  <text x={P.l+W+6} y={yy+4} fontSize="10" fill="rgba(255,255,255,.72)">{v.toFixed(2)}</text>
                </g>
              );
            })}
            <text x={P.l+W+6} y={P.t+12} fontSize="10" fill="rgba(255,255,255,.72)">{capitalize(greekKey)}</text>
          </>
        )}
      </svg>
    </div>
  );
}
function capitalize(s){ return s ? s[0].toUpperCase()+s.slice(1) : s; }

/* =========================
   (Future) Monte Carlo harness — interface only (Step 3)
   ========================= */
async function simulateMC({ spot, mu=0, sigma=0.25, T=30/365, paths=500_000, chunk=25_000, onProgress }){
  // placeholder: we’ll wire the real math in Step 3
  let done = 0;
  const total = Math.max(paths, 1);
  while (done < total){
    const take = Math.min(chunk, total - done);
    await new Promise(r => setTimeout(r, 10));
    done += take;
    onProgress?.(done, total);
  }
  return { ok:true, summary:{} };
}

/* =========================
   Modal
   ========================= */
export default function StrategyModal({ strategy, env, onApply, onClose }) {
  const { spot, currency="USD", sigma=0.25, T=30/365, riskFree=0 } = env || {};

  // editable rows
  const [rows, setRows] = useState(() => {
    const s = Number(spot) || 0;
    return (strategy?.legs || []).map((r) => {
      if (!Number.isFinite(r.strike) && s > 0) {
        const dir = strategy?.direction;
        const pos = r.position;
        let k = s;
        if (pos.includes("Call")) k = dir === "Bullish" ? s * 1.05 : s * 1.03;
        if (pos.includes("Put"))  k = dir === "Bearish" ? s * 0.95 : s * 0.97;
        return { ...r, strike: Math.round(k * 100) / 100, volume: r.volume ?? 1 };
      }
      return { ...r, volume: r.volume ?? 1 };
    });
  });

  // controls
  const [contractSize, setContractSize] = useState(100); // requirement (1)
  const [greek, setGreek] = useState("vega");
  const [commission, ] = useState(0);                     // requirement (5)
  const [mcProgress, setMcProgress] = useState({ done:0, total:0 });

  const chartLegs = useMemo(() => toChartLegs(rows), [rows]);
  const totalPrem = useMemo(() => netPremium(rows), [rows]);

  // Close on ESC + lock background
  const dialogRef = useRef(null);
  useEffect(() => {
    const onEsc = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onEsc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onEsc);
      document.body.style.overflow = prev || "";
    };
  }, [onClose]);

  const edit = (i, field, v) => {
    setRows((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: v === "" ? "" : Number(v) };
      return next;
    });
  };

  const GAP = 14;

  return (
    <div className="modal-root" role="dialog" aria-modal="true" aria-labelledby="sg-modal-title">
      <div className="modal-backdrop" onClick={onClose} />
      <div
        className="modal-sheet"
        ref={dialogRef}
        style={{
          maxWidth: 1120,
          maxHeight: "calc(100vh - 96px)",
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
          padding: 16,
        }}
      >
        {/* Header */}
        <div className="modal-head" style={{ marginBottom: GAP }}>
          <div className="mh-left">
            <div className="mh-icon">
              {strategy?.icon ? <strategy.icon aria-hidden="true" /> : <div className="badge" />}
            </div>
            <div className="mh-meta">
              <div id="sg-modal-title" className="mh-name">
                {strategy?.name || "Strategy"}
              </div>
              <DirectionBadge value={strategy?.direction || "Neutral"} />
            </div>
          </div>
          <div className="mh-actions">
            <button className="button ghost" type="button" onClick={() => {}}>
              Save
            </button>
            <button
              className="button"
              type="button"
              onClick={() => onApply?.(chartLegs, totalPrem)}
            >
              Apply
            </button>
            <button className="button ghost" type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        {/* Controls row (compact, Apple‑ish) */}
        <div
          className="row"
          style={{
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            marginBottom: 10,
          }}
        >
          <div className="row" style={{ gap: 10 }}>
            <div className="fg">
              <label className="small muted">Contract size</label>
              <input
                className="field"
                type="number"
                min={1}
                step={1}
                value={contractSize}
                onChange={(e)=>setContractSize(clamp(e.target.value, 1, 1_000_000))}
                style={{ width: 120, height: 36 }}
              />
            </div>

            <div className="fg">
              <label className="small muted">Greek</label>
              <select
                className="field"
                value={greek}
                onChange={(e)=>setGreek(e.target.value)}
                style={{ width: 140, height: 36 }}
              >
                <option value="none">Not selected</option>
                <option value="delta">Delta</option>
                <option value="gamma">Gamma</option>
                <option value="rho">Rho</option>
                <option value="theta">Theta</option>
                <option value="vega">Vega</option>
              </select>
            </div>
          </div>

          {mcProgress.total > 0 && (
            <div className="small muted" aria-live="polite">
              {mcProgress.done.toLocaleString()} / {mcProgress.total.toLocaleString()} paths
            </div>
          )}
        </div>

        {/* CHART (full‑bleed) */}
        <div style={{ marginBottom: GAP }}>
          <ChartCanvas
            spot={spot}
            rows={rows}
            env={{ sigma, T, riskFree, currency }}
            contractSize={contractSize}
            greek={greek === "none" ? "" : greek}
            height={440}               // slightly taller per your request
            commission={0}
          />
        </div>

        {/* Metrics under chart (still placeholders for now) */}
        <div
          className="metric-strip"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, minmax(0,1fr))",
            gap: GAP,
            marginBottom: GAP,
          }}
        >
          <MetricBox label="Underlying" value={fmtCur(spot, currency)} />
          <MetricBox label="Max Profit" value="—" />
          <MetricBox label="Max Loss" value="—" />
          <MetricBox label="Win Rate" value="—" />
          <MetricBox label="Breakeven" value="—" />
        </div>

        {/* Architecture */}
        <div className="card dense" style={{ marginBottom: GAP }}>
          <div className="section-title">Architecture</div>
          <div
            className="grid-3"
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: GAP }}
          >
            <Spec title="Composition">
              {rows.length ? rows.map((r) => `${r.position}×${r.volume ?? 0}`).join(" · ") : "—"}
            </Spec>
            <Spec title="Breakeven(s)">—</Spec>
            <Spec title="Max Profit">—</Spec>
            <Spec title="Max Loss">—</Spec>
            <Spec title="Risk Profile">{strategy?.direction || "Neutral"}</Spec>
            <Spec title="Greeks Exposure">Δ/Γ/Θ/ν —</Spec>
            <Spec title="Margin Requirement">—</Spec>
          </div>
        </div>

        {/* Configuration */}
        <div className="card dense" style={{ marginBottom: 8 }}>
          <div className="section-title">Configuration</div>
          <div className="sg-table">
            <div className="sg-th">Position</div>
            <div className="sg-th">Strike</div>
            <div className="sg-th">Volume</div>
            <div className="sg-th">Premium</div>

            {rows.map((r, i) => (
              <RowEditor
                key={i}
                row={r}
                onStrike={(v) => edit(i, "strike", v)}
                onVol={(v) => edit(i, "volume", v)}
                onPremium={(v) => edit(i, "premium", v)}
                currency={currency}
              />
            ))}
          </div>

          <div className="row-right small" style={{ marginTop: 10 }}>
            <span className="muted">Net Premium:</span>&nbsp;
            <strong>{fmtCur(totalPrem, currency)}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================
   Subcomponents
   ========================= */
function MetricBox({ label, value }) {
  return (
    <div
      className="card dense"
      style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4 }}
    >
      <div className="small muted">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

function Spec({ title, children }) {
  return (
    <div className="card dense" style={{ padding: 12 }}>
      <div className="small muted">{title}</div>
      <div style={{ marginTop: 6 }}>{children}</div>
    </div>
  );
}

function RowEditor({ row, onStrike, onVol, onPremium, currency }) {
  return (
    <>
      <div className="sg-td strong">{row.position}</div>
      <div className="sg-td">
        <input
          className="field"
          type="number"
          step="0.01"
          value={row.strike ?? ""}
          onChange={(e) => onStrike(e.target.value)}
          placeholder="Strike"
        />
      </div>
      <div className="sg-td">
        <input
          className="field"
          type="number"
          step="1"
          value={row.volume ?? ""}
          onChange={(e) => onVol(e.target.value)}
          placeholder="0"
        />
      </div>
      <div className="sg-td">
        <div style={{ display: "grid", gridTemplateColumns: "12px 1fr", alignItems: "center" }}>
          <span className="small muted" aria-hidden>
            $
          </span>
          <input
            className="field"
            type="number"
            step="0.01"
            value={row.premium ?? ""}
            onChange={(e) => onPremium(e.target.value)}
            placeholder={currency}
          />
        </div>
      </div>
    </>
  );
}
