// components/Icons/StrategyIcon.jsx
"use client";

import React, { useMemo } from "react";
import materializeSeeded from "../Strategy/defs/materializeSeeded";
import rowsToLegs from "../Strategy/utils/rowsToLegs";
import { payoffAt, suggestBounds } from "../../lib/strategy/payoff.js";

/** Tile wrapper (rounded square) */
function IconTile({ size = 48, children }) {
  const radius = Math.round(size / 4);
  return (
    <div
      className="oa-icon-tile"
      style={{ width: size, height: size, borderRadius: radius }}
    >
      {children}
      <style jsx>{`
        .oa-icon-tile {
          display: grid;
          place-items: center;
          border: 1px solid var(--border, rgba(255,255,255,0.1));
          background: linear-gradient(180deg, #1f1f23, #111214);
          color: var(--text, #e5e7eb);
          overflow: hidden;
          box-shadow: inset 0 1px 1px rgba(255,255,255,0.06), 0 1px 2px rgba(0,0,0,0.4);
        }
        @media (prefers-color-scheme: light) {
          .oa-icon-tile {
            border-color: var(--border, rgba(0,0,0,0.1));
            background: linear-gradient(180deg, #fff, #f5f5f5);
            color: var(--text, #111);
            box-shadow: inset 0 1px 1px rgba(255,255,255,0.6), 0 1px 2px rgba(0,0,0,0.08);
          }
        }
      `}</style>
    </div>
  );
}

/** Build SVG area paths above/below zero */
function buildAreaPaths(xs, ys, xScale, yScale) {
  const pos = [], neg = [];
  const eps = 1e-9;
  let seg = null, sign = 0;

  const push = () => {
    if (!seg || seg.length < 3) {
      seg = null;
      return;
    }
    const d =
      seg
        .map((p, i) => `${i ? "L" : "M"}${xScale(p[0])},${yScale(p[1])}`)
        .join(" ") + " Z";
    (sign > 0 ? pos : neg).push(d);
    seg = null;
    sign = 0;
  };

  for (let i = 0; i < xs.length; i++) {
    const x = xs[i], y = ys[i];
    const s = y > eps ? 1 : y < -eps ? -1 : 0;

    if (i > 0) {
      const y0 = ys[i - 1], s0 = y0 > eps ? 1 : y0 < -eps ? -1 : 0;
      if (s !== s0) {
        const x0 = xs[i - 1], dy = y - y0;
        const xCross = dy === 0 ? x : x0 + ((0 - y0) * (x - x0)) / dy;

        if (seg) {
          seg.push([xCross, 0]);
          push();
        }
        if (s !== 0) {
          seg = [[xCross, 0], [x, y]];
          sign = s;
          continue;
        }
        seg = null;
        sign = 0;
        continue;
      }
    }

    if (s === 0) {
      if (seg) {
        seg.push([x, 0]);
        push();
      }
    } else {
      if (!seg) {
        seg = [[x, 0]];
        sign = s;
      }
      seg.push([x, y]);
    }
  }

  if (seg) {
    seg.push([xs[xs.length - 1], 0]);
    push();
  }
  return { pos, neg };
}

/**
 * StrategyIcon – renders a mini payoff chart for the given strategy
 * @param {string} strategy Strategy key (e.g., "bear-call-spread")
 * @param {number} size     Tile size in px
 * @param {boolean} tile    Whether to wrap in OA-style tile
 * @param {number} spot     Underlying price for seeding (fallback 100)
 * @param {number} sigma    Volatility for seeding (annualized)
 * @param {number} T        Time to expiry (years)
 * @param {number} riskFree Risk-free rate
 */
export default function StrategyIcon({
  strategy,
  size = 48,
  tile = true,
  spot = 100,
  sigma = 0.2,
  T = 30 / 365,
  riskFree = 0,
  color,
}) {
  const { line, pos, neg } = useMemo(() => {
    try {
      const env = { spot, sigma, T, riskFree };
      const rows = materializeSeeded(strategy, env);
      const legs = rowsToLegs(rows);
      if (!legs.length) return { line: "", pos: [], neg: [] };
      const bundle = { legs };
      const [lo, hi] = suggestBounds(bundle, { spot: env.spot });
      const N = 80;
      const xs = Array.from({ length: N }, (_, i) => lo + (i * (hi - lo)) / (N - 1));
      const ys = xs.map((x) => payoffAt(x, bundle));
      const yMin = Math.min(0, ...ys);
      const yMax = Math.max(0, ...ys);
      const pad = 0; // no padding so fills reach tile edges
      const xScale = (x) => pad + ((x - lo) / (hi - lo)) * (size - 2 * pad);
      const yScale = (y) =>
        size - pad - ((y - yMin) / (yMax - yMin || 1)) * (size - 2 * pad);
      const line = ys
        .map((y, i) => `${i ? "L" : "M"}${xScale(xs[i])},${yScale(y)}`)
        .join(" ");
      const { pos, neg } = buildAreaPaths(xs, ys, xScale, yScale);
      return { line, pos, neg };
    } catch {
      return { line: "", pos: [], neg: [] };
    }
  }, [strategy, spot, sigma, T, riskFree, size]);

  const stroke = color || "currentColor";

  const svg = (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      fill="none"
      stroke={stroke}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      shapeRendering="geometricPrecision"
      aria-hidden="true"
    >
      {neg.map((d, i) => (
        <path key={`neg-${i}`} d={d} fill="rgba(255,69,58,0.4)" stroke="none" />
      ))}
      {pos.map((d, i) => (
        <path key={`pos-${i}`} d={d} fill="rgba(52,199,89,0.4)" stroke="none" />
      ))}
      {line && <path d={line} fill="none" stroke={stroke} />}
    </svg>
  );

  if (!tile) return svg;
  return <IconTile size={size}>{svg}</IconTile>;
}

