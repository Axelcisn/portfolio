// components/Strategy/StrategyTile.jsx
"use client";

/**
 * Strategy tile — refined + OA-style icon support
 * - Accepts optional props: `iconName` and `renderIcon(name) => ReactNode`.
 * - If `renderIcon` is provided (from StrategyGallery), render OA-style icon.
 * - Otherwise fallback to local inline glyphs (no external imports).
 * - Small direction pill at top-right (Bullish/Bearish/Neutral).
 * - Metrics in two rows:
 *      Row 1: Sharpe | P[Win]
 *      Row 2: E[Prof] | E[Ret]
 * - Only the *values* are in pills. E[Prof] and E[Ret] pills turn green/red by sign.
 * - No footer tags.
 */

export default function StrategyTile({ item, onOpen, iconName, renderIcon }) {
  const {
    id,
    name,
    direction = "Neutral",
    metrics = {},
    isManual = false,
  } = item || {};

  const handleKey = (e) => {
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      onOpen?.();
    }
  };

  const vSharpe = num(metrics.sharpe);
  const vPwin = num(metrics.pWin);
  const vProf = num(metrics.expectedProfit);
  const vRet = num(metrics.expectedReturn);

  // Prefer gallery-provided OA icon; otherwise fallback to inline glyph.
  const iconEl =
    typeof renderIcon === "function"
      ? renderIcon(iconName || id || name)
      : null;

  return (
    <button
      type="button"
      className={`s-tile ${isManual ? "manual" : ""}`}
      onClick={() => onOpen?.()}
      onKeyDown={handleKey}
      aria-label={`${name || id || "Strategy"} card`}
    >
      {/* header: icon + small direction pill */}
      <div className="s-head">
        <div className="s-ico">
          {iconEl ? (
            // OA-style icon tile provided by gallery
            iconEl
          ) : (
            // Fallback: local inline glyphs (keeps existing behavior)
            <StrategyGlyphLocal id={iconName || id || name} manual={isManual} />
          )}
        </div>
        <DirectionBadge dir={direction} />
      </div>

      {/* title */}
      <div className="s-name" title={name || id}>
        {name || id}
      </div>

      {/* metrics in two neat rows */}
      <div className="s-metrics">
        <div className="mrow">
          <Metric label="Sharpe" value={vSharpe} display={fmt(vSharpe)} tone="neutral" />
          <Metric label="P[Win]" value={vPwin} display={fmtPct(vPwin)} tone="neutral" />
        </div>
        <div className="mrow">
          <Metric
            label="E[Prof]"
            value={vProf}
            display={fmtMoney(vProf)}
            tone="signed"
          />
          <Metric
            label="E[Ret]"
            value={vRet}
            display={fmtPct(vRet)}
            tone="signed"
          />
        </div>
      </div>

      <style jsx>{`
        .s-tile{
          position:relative;
          display:grid;
          grid-template-rows:auto auto auto;
          gap:12px;
          padding:16px;
          width:100%;
          border:1px solid var(--border);
          border-radius:18px;
          background:var(--card);
          color:var(--text);
          text-align:left;
          box-shadow:0 1px 2px rgba(0,0,0,.06), 0 8px 20px rgba(0,0,0,.06);
          transition:transform .16s ease, box-shadow .16s ease, border-color .16s ease;
          cursor:pointer;
        }
        .s-tile:hover{ transform:translateY(-2px); box-shadow:0 4px 10px rgba(0,0,0,.1), 0 16px 40px rgba(0,0,0,.14); }
        .s-tile:active{ transform:translateY(0); }
        .s-tile:focus{ outline:2px solid var(--accent); outline-offset:2px; }
        .s-tile.manual{ background:linear-gradient(0deg, rgba(0,122,255,.06), transparent), var(--card); }

        .s-head{ display:flex; align-items:center; justify-content:space-between; }
        .s-ico{ width:44px; height:44px; display:grid; place-items:center; }
        .s-name{ font-weight:700; font-size:16px; letter-spacing:.2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

        .s-metrics{ display:grid; gap:8px; }
        .mrow{ display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:10px; align-items:center; }

        .mitem{ display:flex; align-items:center; justify-content:space-between; gap:10px; }
        .mlabel{ font-size:12px; opacity:.72; }
        .mval{
          display:inline-flex; align-items:center; justify-content:center;
          height:24px; padding:0 10px; border-radius:9999px;
          font-size:12px; font-variant-numeric:tabular-nums;
          border:1px solid var(--border); background:var(--bg); color:var(--text);
        }
        /* signed colouring for profit & return */
        .mval.pos{ background:rgba(22,163,74,.12); border-color:rgba(22,163,74,.45); color:#16a34a; }
        .mval.neg{ background:rgba(239,68,68,.12); border-color:rgba(239,68,68,.45); color:#ef4444; }

        /* small, clean direction pill */
        .s-badge{
          display:inline-flex; align-items:center;
          height:22px; padding:0 8px; border-radius:9999px;
          font-size:12px; font-weight:700; letter-spacing:.2px;
          border:1px solid transparent; background:transparent;
        }
        .s-badge.bullish{ color:#06b6d4; background:rgba(6,182,212,.12); border-color:rgba(6,182,212,.45); }
        .s-badge.bearish{ color:#f59e0b; background:rgba(245,158,11,.12); border-color:rgba(245,158,11,.45); }
        .s-badge.neutral{ color:#8b5cf6; background:rgba(139,92,246,.12); border-color:rgba(139,92,246,.45); }
      `}</style>
    </button>
  );
}

/* ---------- Metric (label + value pill) ---------- */
function Metric({ label, value, display, tone }) {
  const has = Number.isFinite(value);
  const signClass =
    tone === "signed" && has ? (value > 0 ? "pos" : value < 0 ? "neg" : "") : "";
  return (
    <div className="mitem" role="group" aria-label={`${label}`}>
      <span className="mlabel">{label}</span>
      <span className={`mval ${signClass}`}>{has ? display : "—"}</span>
    </div>
  );
}

/* ---------- helpers ---------- */
function num(v){ const n = Number(v); return Number.isFinite(n) ? n : NaN; }
function fmt(n){ if(!Number.isFinite(n)) return "—"; const s=Math.abs(n)>=10?n.toFixed(1):n.toFixed(2); return s.replace(/\.00$/,""); }
function fmtPct(n){ if(!Number.isFinite(n)) return "—"; return `${(n).toFixed(0)}%`; }
function fmtMoney(n){ if(!Number.isFinite(n)) return "—"; return (Math.abs(n)>=1000? n.toFixed(0) : n.toFixed(0)); }

/* ---------- Inline glyph system (fallback only; no external imports) ---------- */
function StrategyGlyphLocal({ id, manual=false }){
  const key = manual ? "manual" : iconKeyFromId(id || "");
  const C = ICONS[key] || ICONS.up;
  return <C/>;
}

const STROKE = "#22c55e";
const SW = 2;

function Box({ children }){
  return (
    <svg viewBox="0 0 40 40" className="s-glyph" aria-hidden="true">
      <rect x="2" y="2" width="36" height="36" rx="10" ry="10"
        fill="var(--bg, #fff)" stroke="var(--border, #e5e7eb)" />
      <g fill="none" stroke={STROKE} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
        {children}
      </g>
      <style jsx>{`.s-glyph{width:100%;height:100%;display:block;}`}</style>
    </svg>
  );
}
const ICONS = {
  up:()=>(<Box><path d="M8 26 L18 18 L32 14" /><circle cx="32" cy="14" r="1.5" fill={STROKE}/></Box>),
  down:()=>(<Box><path d="M8 14 L18 20 L32 26" /><circle cx="8" cy="14" r="1.5" fill={STROKE}/></Box>),
  v:()=>(<Box><path d="M8 14 L20 26 L32 14"/></Box>),
  caret:()=>(<Box><path d="M8 26 L20 14 L32 26"/></Box>),
  flat:()=>(<Box><path d="M8 20 L32 20"/></Box>),
  condor:()=>(<Box><path d="M8 22 Q14 14 20 22 T32 22"/></Box>),
  u:()=>(<Box><path d="M8 18 Q14 26 20 18 T32 18"/></Box>),
  box:()=>(<Box><path d="M12 12 L28 28 M28 12 L12 28"/></Box>),
  ratio:()=>(<Box><path d="M8 24 L20 18 L32 14"/><path d="M20 18 L32 22"/></Box>),
  cal:()=>(<Box><path d="M10 24 L30 16"/><path d="M10 20 L22 14"/></Box>),
  diag:()=>(<Box><path d="M10 26 L30 14"/><path d="M10 20 L18 16"/></Box>),
  manual:()=>(<Box><path d="M20 10 L20 30 M10 20 L30 20"/></Box>),
};
function iconKeyFromId(name){
  const s=String(name||"").toLowerCase();
  if(!s) return "up";
  if(s.includes("manual")) return "manual";
  if(s.includes("long call")) return "up";
  if(s.includes("short put")) return "up";
  if(s.includes("protective put")) return "up";
  if(s.includes("leaps")) return "up";
  if(s.includes("long put")) return "down";
  if(s.includes("short call")) return "down";
  if(s.includes("bear put")||s.includes("bear call")) return "down";
  if(s.includes("straddle")) return (s.includes("short") ? "caret" : "v");
  if(s.includes("strangle")) return (s.includes("short") ? "caret" : "v");
  if(s.includes("iron condor")||s.includes("reverse condor")) return "condor";
  if(s.includes("butterfly")) return (s.includes("reverse") ? "u" : "caret");
  if(s.includes("calendar")) return "cal";
  if(s.includes("diagonal")) return "diag";
  if(s.includes("ratio")||s.includes("backspread")) return "ratio";
  if(s.includes("box")) return "box";
  if(s.includes("reversal")) return "flat";
  if(s.includes("repair")) return "up";
  if(s.includes("covered")) return "flat";
  return "up";
}

/* ---------- small Direction pill ---------- */
function DirectionBadge({ dir }){
  const cls = dir==="Bullish"?"bullish":dir==="Bearish"?"bearish":"neutral";
  return (
    <>
      <span className={`s-badge ${cls}`}>{dir}</span>
      <style jsx>{`
        .s-badge{
          display:inline-flex; align-items:center;
          height:22px; padding:0 8px; border-radius:9999px;
          font-size:12px; font-weight:700; letter-spacing:.2px;
          border:1px solid transparent; background:transparent;
        }
        .s-badge.bullish{ color:#06b6d4; background:rgba(6,182,212,.12); border-color:rgba(6,182,212,.45); }
        .s-badge.bearish{ color:#f59e0b; background:rgba(245,158,11,.12); border-color:rgba(245,158,11,.45); }
        .s-badge.neutral{ color:#8b5cf6; background:rgba(139,92,246,.12); border-color:rgba(139,92,246,.45); }
      `}</style>
    </>
  );
}