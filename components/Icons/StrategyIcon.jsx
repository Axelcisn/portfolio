// components/Icons/StrategyIcon.jsx
"use client";
import React from "react";

/** Shared SVG wrapper */
function Svg({ size = 48, stroke = "currentColor", children, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke={stroke}
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** Tile wrapper (rounded square, OA-like) */
function IconTile({ size = 48, children }) {
  const radius = Math.round(size / 4);
  return (
    <div className="oa-icon-tile" style={{ width: size, height: size, borderRadius: radius }}>
      {children}
      <style jsx>{`
        .oa-icon-tile {
          display: grid;
          place-items: center;
          border: 1px solid var(--border, #2a2f3a);
          background: var(--card, #111214);
          color: var(--oa-green, #22c55e);
        }
        @media (prefers-color-scheme: light) {
          .oa-icon-tile {
            border-color: var(--border, #e5e7eb);
            background: #fff;
            color: var(--oa-green-700, #16a34a);
          }
        }
      `}</style>
    </div>
  );
}

/* ===== Glyphs (Option Alpha-style approximations) ===== */

// Slopes
const BullSlope = (p) => (
  <Svg {...p}>
    <path d="M8 36 Q 20 22 40 12" />
    <circle cx="8" cy="36" r="1.6" />
  </Svg>
);
const BearSlope = (p) => (
  <Svg {...p}>
    <path d="M8 12 Q 20 26 40 36" />
    <circle cx="8" cy="12" r="1.6" />
  </Svg>
);

// “Tent” (straddles/strangles)
const VTent = (p) => (
  <Svg {...p}>
    <path d="M8 36 L24 12 L40 36" />
  </Svg>
);
const InvertedTent = (p) => (
  <Svg {...p}>
    <path d="M8 12 L24 36 L40 12" />
  </Svg>
);

// Spreads / stepped
const SteppedUp = (p) => (
  <Svg {...p}>
    <path d="M8 36 L22 36 L26 24 L40 24" />
  </Svg>
);
const SteppedDown = (p) => (
  <Svg {...p}>
    <path d="M8 24 L22 24 L26 36 L40 36" />
  </Svg>
);
const SteppedFlat = (p) => (
  <Svg {...p}>
    <path d="M8 30 L40 30" />
  </Svg>
);

// Calendars
const Calendar = (p) => (
  <Svg {...p}>
    <path d="M10 30 C14 26, 18 26, 22 30" />
    <path d="M26 30 C30 26, 34 26, 38 30" />
  </Svg>
);

// Ratios / backspreads
const RatioUp = (p) => (
  <Svg {...p}>
    <path d="M8 36 Q 20 25 30 20" />
    <path d="M30 20 Q 36 17 40 12" />
  </Svg>
);
const RatioDown = (p) => (
  <Svg {...p}>
    <path d="M8 12 Q 20 23 30 28" />
    <path d="M30 28 Q 36 31 40 36" />
  </Svg>
);

// Butterflies
const ButterflyUp = (p) => (
  <Svg {...p}>
    <path d="M8 36 L20 18 L24 12 L28 18 L40 36" />
  </Svg>
);
const ButterflyDown = (p) => (
  <Svg {...p}>
    <path d="M8 12 L20 30 L24 36 L28 30 L40 12" />
  </Svg>
);

// Diagonals
const DiagonalUp = (p) => (
  <Svg {...p}>
    <path d="M10 36 L36 12" />
  </Svg>
);
const DiagonalDown = (p) => (
  <Svg {...p}>
    <path d="M10 12 L36 36" />
  </Svg>
);

// Boxes / special
const BoxLong = (p) => (
  <Svg {...p}>
    <rect x="12" y="16" width="24" height="16" rx="2.5" />
  </Svg>
);
const BoxShort = (p) => (
  <Svg {...p}>
    <rect x="12" y="16" width="24" height="16" rx="2.5" />
    <path d="M16 20 L32 28" />
    <path d="M32 20 L16 28" />
  </Svg>
);
const Cross = (p) => (
  <Svg {...p}>
    <path d="M14 14 L34 34" />
    <path d="M34 14 L14 34" />
  </Svg>
);

// Fallback (small dot)
const Dot = (p) => (
  <Svg {...p}>
    <circle cx="24" cy="24" r="2.2" />
  </Svg>
);

/* ===== Strategy → Glyph mapping ===== */

export const iconsMap = {
  // Calls / Puts
  long_call: BullSlope,
  short_call: BearSlope,
  long_put: BearSlope,
  short_put: BullSlope,
  protective_put: SteppedUp,
  covered_call: SteppedDown,
  covered_put: SteppedUp,
  collar: SteppedFlat,
  leaps: BullSlope,

  // Spreads
  bull_call_spread: SteppedUp,
  bull_put_spread: SteppedUp,
  bear_call_spread: SteppedDown,
  bear_put_spread: SteppedDown,

  // Straddles / Strangles
  long_straddle: VTent,
  short_straddle: InvertedTent,
  long_strangle: VTent,
  short_strangle: InvertedTent,

  // Calendars
  call_calendar: Calendar,
  put_calendar: Calendar,

  // Condors / Butterflies
  iron_condor: InvertedTent,
  iron_butterfly: InvertedTent,
  reverse_condor: VTent,
  reverse_butterfly: VTent,
  call_butterfly: ButterflyUp,
  put_butterfly: ButterflyDown,

  // Diagonals
  call_diagonal: DiagonalUp,
  put_diagonal: DiagonalDown,

  // Ratios / Backspreads
  call_ratio: RatioUp,
  put_ratio: RatioDown,
  call_backspread: RatioUp,
  put_backspread: RatioDown,

  // Boxes / misc
  long_box: BoxLong,
  short_box: BoxShort,
  reversal: Cross,
  strap: BullSlope,
  stock_repair: SteppedUp,

  // Manual builder
  manual: Cross,
};

/**
 * StrategyIcon – drop-in icon that renders an OA-style tile + glyph
 * @param {string} name  strategy key (see iconsMap)
 * @param {number} size  tile size in px (default 48)
 * @param {boolean} tile whether to render tile container (default true)
 * @param {string}  color CSS color for glyph (defaults to OA green)
 */
export default function StrategyIcon({ name, size = 48, tile = true, color }) {
  const Glyph = iconsMap[name] || Dot;
  const stroke = color || "currentColor";
  const inner = <Glyph size={Math.max(32, Math.min(48, size))} stroke={stroke} />;

  if (!tile) return inner;
  return (
    <IconTile size={size}>
      {inner}
    </IconTile>
  );
}