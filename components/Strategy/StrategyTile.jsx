// components/Strategy/StrategyTile.jsx
"use client";

/**
 * Self‑contained Strategy tile.
 * - No external icon imports (inline SVG glyphs below).
 * - Works in light/dark (uses your CSS variables: --card, --border, --text).
 * - Accessible: button role, keyboard (Enter/Space), aria labels.
 */

function MetricPill({ label, value }) {
  if (value === null || value === undefined || value === "—") return null;
  return (
    <div className="s-metric" aria-label={label}>
      <span className="s-metric-k">{label}</span>
      <span className="s-metric-v">{value}</span>
      <style jsx>{`
        .s-metric {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          height: 26px;
          padding: 0 10px;
          border-radius: 9999px;
          border: 1px solid var(--border);
          background: var(--bg, transparent);
          font-size: 12px;
        }
        .s-metric-k { opacity: .75; }
        .s-metric-v { font-weight: 700; }
      `}</style>
    </div>
  );
}

function DirectionBadge({ dir }) {
  const k = dir === "Bullish" ? "bullish" : dir === "Bearish" ? "bearish" : "neutral";
  return (
    <span className={`s-badge ${k}`} aria-label={`Direction: ${dir}`}>{dir}</span>
  );
}

export default function StrategyTile({ item, onOpen }) {
  const { id, name, direction = "Neutral", metrics = {}, isManual = false, isMulti } = item || {};

  const handleKey = (e) => {
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      onOpen?.();
    }
  };

  return (
    <button
      type="button"
      className={`s-tile ${isManual ? "manual" : ""}`}
      onClick={() => onOpen?.()}
      onKeyDown={handleKey}
      aria-label={`${name || id || "Strategy"} tile`}
    >
      {/* header: icon + direction badge */}
      <div className="s-head">
        <div className="s-ico">
          <StrategyGlyphLocal id={id || name} manual={isManual} />
        </div>
        <DirectionBadge dir={direction} />
      </div>

      {/* title */}
      <div className="s-name" title={name || id}>{name || id}</div>

      {/* metrics strip */}
      <div className="s-strip" aria-hidden={false}>
        <MetricPill label="Sharpe" value={fmt(metrics.sharpe)} />
        <MetricPill label="E[Ret]" value={fmtPct(metrics.expectedReturn)} />
        <MetricPill label="E[Prof]" value={fmtMoney(metrics.expectedProfit)} />
        <MetricPill label="P[Win]" value={fmtPct(metrics.pWin)} />
      </div>

      {/* tag (single/multi) */}
      <div className="s-foot">
        <span className="s-tag">{isMulti ? "Multi-leg" : "Single-leg"}</span>
      </div>

      {/* component-scoped styles */}
      <style jsx>{`
        .s-tile {
          position: relative;
          display: grid;
          grid-template-rows: auto auto auto auto;
          gap: 10px;
          padding: 14px;
          width: 100%;
          border: 1px solid var(--border);
          border-radius: 18px;
          background: var(--card);
          color: var(--text);
          text-align: left;
          box-shadow: 0 1px 2px rgba(0,0,0,.06), 0 8px 20px rgba(0,0,0,.06);
          transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease;
          cursor: pointer;
        }
        .s-tile:hover { transform: translateY(-2px); box-shadow: 0 4px 10px rgba(0,0,0,.10), 0 16px 40px rgba(0,0,0,.14); }
        .s-tile:active { transform: translateY(0); }
        .s-tile:focus { outline: 2px solid var(--accent); outline-offset: 2px; }
        .s-tile.manual { background: linear-gradient(0deg, rgba(0,122,255,.06), transparent), var(--card); }

        .s-head { display: flex; align-items: center; justify-content: space-between; }
        .s-ico { width: 44px; height: 44px; }
        .s-name {
          font-weight: 700;
          font-size: 16px;
          letter-spacing: .2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .s-strip { display: flex; gap: 6px; flex-wrap: wrap; }
        .s-foot { display: flex; justify-content: flex-end; }
        .s-tag {
          font-size: 11px;
          padding: 3px 8px;
          border-radius: 9999px;
          background: rgba(127,127,127,.08);
          border: 1px solid var(--border);
        }

        /* Direction badge (distinct palette; not using red/green/gray) */
        .s-badge {
          height: 24px;
          padding: 0 10px;
          border-radius: 9999px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: .2px;
          border: 1px solid transparent;
          background: transparent;
        }
        .s-badge.bullish { color: #06b6d4; border-color: rgba(6,182,212,.45); }
        .s-badge.bearish { color: #f59e0b; border-color: rgba(245,158,11,.45); }
        .s-badge.neutral { color: #8b5cf6; border-color: rgba(139,92,246,.45); }
      `}</style>
    </button>
  );
}

/* ---------- helpers ---------- */
function fmt(n) {
  if (!Number.isFinite(n)) return "—";
  const s = Math.abs(n) >= 10 ? n.toFixed(1) : n.toFixed(2);
  return s.replace(/\.00$/, "");
}
function fmtPct(n) {
  if (!Number.isFinite(n)) return "—";
  return `${(n).toFixed(0)}%`;
}
function fmtMoney(n) {
  if (!Number.isFinite(n)) return "—";
  return (Math.abs(n) >= 1000 ? n.toFixed(0) : n.toFixed(0));
}

/* ---------- Inline icon system (no external file) ---------- */
function StrategyGlyphLocal({ id, manual = false }) {
  const key = manual ? "manual" : iconKeyFromId(id || "");
  const C = ICONS[key] || ICONS.up;
  return <C />;
}

const STROKE = "#22c55e";       // mint
const SW = 2;

function Box({ children }) {
  return (
    <svg viewBox="0 0 40 40" className="s-glyph" aria-hidden="true">
      <rect x="2" y="2" width="36" height="36" rx="10" ry="10"
        fill="var(--bg, #fff)" stroke="var(--border, #e5e7eb)" />
      <g fill="none" stroke={STROKE} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
        {children}
      </g>
      <style jsx>{`
        .s-glyph { width: 100%; height: 100%; display: block; }
      `}</style>
    </svg>
  );
}

const ICONS = {
  up:     () => (<Box><path d="M8 26 L18 18 L32 14" /><circle cx="32" cy="14" r="1.5" fill={STROKE}/></Box>),
  down:   () => (<Box><path d="M8 14 L18 20 L32 26" /><circle cx="8" cy="14" r="1.5" fill={STROKE}/></Box>),
  v:      () => (<Box><path d="M8 14 L20 26 L32 14" /></Box>),
  caret:  () => (<Box><path d="M8 26 L20 14 L32 26" /></Box>),
  flat:   () => (<Box><path d="M8 20 L32 20" /></Box>),
  condor: () => (<Box><path d="M8 22 Q14 14 20 22 T32 22" /></Box>),
  u:      () => (<Box><path d="M8 18 Q14 26 20 18 T32 18" /></Box>),
  box:    () => (<Box><path d="M12 12 L28 28 M28 12 L12 28" /></Box>),
  ratio:  () => (<Box><path d="M8 24 L20 18 L32 14" /><path d="M20 18 L32 22" /></Box>),
  cal:    () => (<Box><path d="M10 24 L30 16" /><path d="M10 20 L22 14" /></Box>),
  diag:   () => (<Box><path d="M10 26 L30 14" /><path d="M10 20 L18 16" /></Box>),
  manual: () => (<Box><path d="M20 10 L20 30 M10 20 L30 20" /></Box>),
};

// Heuristic mapping from strategy id/name → glyph
function iconKeyFromId(name) {
  const s = String(name || "").toLowerCase();
  if (!s) return "up";
  if (s.includes("manual")) return "manual";

  if (s.includes("long call")) return "up";
  if (s.includes("short put")) return "up";
  if (s.includes("protective put")) return "up";
  if (s.includes("leaps")) return "up";

  if (s.includes("long put")) return "down";
  if (s.includes("short call")) return "down";
  if (s.includes("bear put") || s.includes("bear call")) return "down";

  if (s.includes("straddle")) return s.includes("short") ? "caret" : "v";
  if (s.includes("strangle")) return s.includes("short") ? "caret" : "v";

  if (s.includes("iron condor") || s.includes("reverse condor")) return "condor";
  if (s.includes("butterfly")) return s.includes("reverse") ? "u" : "caret";

  if (s.includes("calendar")) return "cal";
  if (s.includes("diagonal")) return "diag";

  if (s.includes("ratio") || s.includes("backspread")) return "ratio";
  if (s.includes("box")) return "box";
  if (s.includes("reversal")) return "flat";
  if (s.includes("repair")) return "up";
  if (s.includes("covered")) return "flat";

  return "up";
}
