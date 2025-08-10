// components/Strategy/StrategyModal.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DirectionBadge from "./DirectionBadge";

/* ---------- helpers ---------- */

const POS_MAP = {
  "Long Call": { key: "lc", sign: +1 },
  "Short Call": { key: "sc", sign: -1 },
  "Long Put": { key: "lp", sign: +1 },
  "Short Put": { key: "sp", sign: -1 },
};

const clamp = (x, lo, hi) => Math.min(Math.max(Number(x) || 0, lo), hi);
const fmtMoney = (n, ccy = "USD") => {
  const sign = ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : "$";
  if (!Number.isFinite(+n)) return "—";
  const v = Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(2);
  return `${sign}${v}`;
};

/** P&L at expiration for a single leg (per 1 contract). Premium is cost (long) / credit (short). */
function legPnLAtExpiry(row, S) {
  const K = Number(row.strike);
  const q = Number(row.volume || 0);
  const prem = Number(row.premium || 0);

  if (!Number.isFinite(K) || !Number.isFinite(q)) return 0;

  const pos = row.position || "";
  let payoff = 0;

  if (pos === "Long Call") payoff = Math.max(S - K, 0) - prem;
  else if (pos === "Short Call") payoff = -Math.max(S - K, 0) + prem;
  else if (pos === "Long Put") payoff = Math.max(K - S, 0) - prem;
  else if (pos === "Short Put") payoff = -Math.max(K - S, 0) + prem;

  return payoff * q;
}

function sumPnL(rows, S) {
  return rows.reduce((acc, r) => acc + legPnLAtExpiry(r, S), 0);
}

/** simple bell curve centered at spot, scaled just for display */
function bellY(x, mu, sigmaLike, amp) {
  const s = sigmaLike > 0 ? sigmaLike : mu > 0 ? 0.12 * mu : 1;
  const v = Math.exp(-0.5 * ((x - mu) / s) ** 2);
  return amp * v;
}

/* ---------- chart (inline SVG, no external deps) ---------- */

function MiniPayoffChart({ rows, spot = 0, sigma = 0.25, currency = "USD" }) {
  // sample domain around strikes & spot
  const { xs, ysExp, ysCur, yMin, yMax } = useMemo(() => {
    const Ks = rows
      .map((r) => Number(r.strike))
      .filter((v) => Number.isFinite(v) && v > 0);

    const haveAnyK = Ks.length > 0;
    const lo = Math.max(0, Math.min(...(haveAnyK ? Ks : [spot || 100])) * 0.8);
    const hi = Math.max(...(haveAnyK ? Ks : [spot || 100])) * 1.2;
    const a = lo === hi ? [Math.max(1, (spot || 100) * 0.8), (spot || 100) * 1.2] : [lo, hi];

    const N = 180;
    const xs = Array.from({ length: N }, (_, i) => a[0] + (i * (a[1] - a[0])) / (N - 1));

    // expiration P&L
    const ysExp = xs.map((x) => sumPnL(rows, x));

    // "current" line = same curve for structure (we'll wire live greeks later)
    const ysCur = ysExp.slice();

    const yMin = Math.min(...ysExp);
    const yMax = Math.max(...ysExp);

    return { xs, ysExp, ysCur, yMin, yMax };
  }, [rows, spot]);

  // dimensions & scales
  const W = 1080; // wide canvas; will scale in CSS
  const H = 420;
  const pad = { t: 24, r: 64, b: 48, l: 64 };

  const xMin = xs[0] ?? 0;
  const xMax = xs[xs.length - 1] ?? 1;

  const ySpan = Math.max(1, (yMax - yMin) || 1);
  const yMinPad = yMin - 0.08 * ySpan;
  const yMaxPad = yMax + 0.08 * ySpan;

  const xToPx = (x) => pad.l + ((x - xMin) / (xMax - xMin)) * (W - pad.l - pad.r);
  const yToPx = (y) => H - pad.b - ((y - yMinPad) / (yMaxPad - yMinPad)) * (H - pad.t - pad.b);

  // lines
  const pathFrom = (arr) =>
    arr
      .map((y, i) => `${i ? "L" : "M"} ${xToPx(xs[i]).toFixed(2)} ${yToPx(y).toFixed(2)}`)
      .join(" ");

  const pathExp = pathFrom(ysExp);
  const pathCur = pathFrom(ysCur);

  // ticks
  const xTicks = 8;
  const yTicks = 6;
  const xTickVals = Array.from({ length: xTicks }, (_, i) => xMin + (i * (xMax - xMin)) / (xTicks - 1));
  const yTickVals = Array.from({ length: yTicks }, (_, i) => yMinPad + (i * (yMaxPad - yMinPad)) / (yTicks - 1));

  // bell (orange dashed)
  const amp = (yMaxPad - yMinPad) * 0.22;
  const bell = xs.map((x) => bellY(x, spot || (xMin + xMax) / 2, (xMax - xMin) * 0.12, amp) + yMinPad);
  const pathBell = pathFrom(bell);

  return (
    <div className="sg-chart-wrap" style={{ width: "100%" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "360px", display: "block" }}>
        {/* grid */}
        <g stroke="var(--border)" opacity="0.5">
          {xTickVals.map((x, i) => (
            <line key={`x-${i}`} x1={xToPx(x)} x2={xToPx(x)} y1={pad.t} y2={H - pad.b} />
          ))}
          {yTickVals.map((y, i) => (
            <line key={`y-${i}`} x1={pad.l} x2={W - pad.r} y1={yToPx(y)} y2={yToPx(y)} />
          ))}
        </g>

        {/* axes */}
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="var(--text)" opacity="0.5" />
        <line x1={pad.l} x2={pad.l} y1={pad.t} y2={H - pad.b} stroke="var(--text)" opacity="0.5" />

        {/* zero line */}
        <line
          x1={pad.l}
          x2={W - pad.r}
          y1={yToPx(0)}
          y2={yToPx(0)}
          stroke="var(--text)"
          opacity="0.35"
          strokeWidth="1"
        />

        {/* spot marker */}
        {Number.isFinite(spot) && spot > 0 && (
          <g stroke="var(--text)" opacity="0.5">
            <line
              x1={xToPx(spot)}
              x2={xToPx(spot)}
              y1={pad.t}
              y2={H - pad.b}
              strokeDasharray="4 4"
            />
          </g>
        )}

        {/* curves */}
        <path d={pathExp} fill="none" stroke="#ff2d55" strokeWidth="2.2" /> {/* Expiration (pink) */}
        <path d={pathCur} fill="none" stroke="#0a84ff" strokeWidth="2" strokeDasharray="4 3" /> {/* Current (dotted) */}
        <path d={pathBell} fill="none" stroke="#ff9f0a" strokeWidth="2" strokeDasharray="7 6" opacity="0.9" /> {/* Bell */}

        {/* x ticks */}
        <g fill="var(--text)" fontSize="11" opacity="0.85">
          {xTickVals.map((x, i) => (
            <text key={`xt-${i}`} x={xToPx(x)} y={H - pad.b + 16} textAnchor="middle">
              {Math.round(x)}
            </text>
          ))}
        </g>

        {/* y ticks */}
        <g fill="var(--text)" fontSize="11" opacity="0.85">
          {yTickVals.map((y, i) => (
            <text key={`yt-${i}`} x={pad.l - 8} y={yToPx(y) + 4} textAnchor="end">
              {fmtMoney(y, currency)}
            </text>
          ))}
        </g>

        {/* legend */}
        <g fontSize="12" fill="var(--text)">
          <circle cx={pad.l + 8} cy={pad.t + 6} r="4" fill="#0a84ff" />
          <text x={pad.l + 18} y={pad.t + 10}>Current P&L</text>
          <circle cx={pad.l + 120} cy={pad.t + 6} r="4" fill="#ff2d55" />
          <text x={pad.l + 130} y={pad.t + 10}>Expiration P&L</text>
          <circle cx={pad.l + 250} cy={pad.t + 6} r="4" fill="#ff9f0a" />
          <text x={pad.l + 260} y={pad.t + 10}>Bell (placeholder)</text>
        </g>
      </svg>

      {/* metrics row (bottom of chart) */}
      <div className="sg-metrics" style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8, marginTop: 8 }}>
        <div className="tile small">
          <div className="sublabel">Underlying</div>
          <div className="value">{fmtMoney(spot, currency)}</div>
        </div>
        <div className="tile small">
          <div className="sublabel">Max Profit</div>
          <div className="value">—</div>
        </div>
        <div className="tile small">
          <div className="sublabel">Max Loss</div>
          <div className="value">—</div>
        </div>
        <div className="tile small">
          <div className="sublabel">Win Rate</div>
          <div className="value">—</div>
        </div>
        <div className="tile small">
          <div className="sublabel">Breakeven</div>
          <div className="value">—</div>
        </div>
      </div>
    </div>
  );
}

/* ---------- modal ---------- */

export default function StrategyModal({ strategy, env, onApply, onClose }) {
  const { spot, sigma, T, riskFree, currency } = env || {};

  // start with the four rows so the table matches your legacy structure
  const [rows, setRows] = useState(() => {
    const base = [
      { position: "Long Call", strike: "", volume: 0, premium: 0 },
      { position: "Short Call", strike: "", volume: 0, premium: 0 },
      { position: "Long Put", strike: "", volume: 0, premium: 0 },
      { position: "Short Put", strike: "", volume: 0, premium: 0 },
    ];
    // merge any legs coming from the tile
    (strategy?.legs || []).forEach((leg) => {
      const idx = base.findIndex((b) => b.position === leg.position);
      if (idx >= 0) base[idx] = { ...base[idx], ...leg };
    });
    return base;
  });

  // accessibility & closing
  useEffect(() => {
    const onEsc = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onEsc);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onEsc);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const edit = (i, field, v) =>
    setRows((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: v === "" ? "" : Number(v) };
      return next;
    });

  // prepare legs + premium for "Apply"
  const legsForApply = useMemo(() => {
    const empty = { enabled: false, K: NaN, qty: 0 };
    const obj = { lc: { ...empty }, sc: { ...empty }, lp: { ...empty }, sp: { ...empty } };
    rows.forEach((r) => {
      const map = POS_MAP[r.position];
      if (!map) return;
      const K = Number(r.strike);
      const qty = Number(r.volume || 0);
      if (Number.isFinite(K) && Number.isFinite(qty) && qty > 0) {
        obj[map.key] = { enabled: true, K, qty };
      }
    });
    const netPrem = rows.reduce((acc, r) => {
      const p = Number(r.premium || 0);
      const q = Number(r.volume || 0);
      const m = POS_MAP[r.position];
      if (!m) return acc;
      return acc + (m.sign * p * q);
    }, 0);
    return { legs: obj, netPremium: netPrem };
  }, [rows]);

  return (
    <div className="modal-root" role="dialog" aria-modal="true" aria-labelledby="sg-modal-title">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-sheet" style={{ maxWidth: 1120 }}>
        {/* Header */}
        <div className="modal-head">
          <div className="mh-left">
            <div className="mh-icon">{strategy.icon && <strategy.icon aria-hidden="true" />}</div>
            <div className="mh-meta">
              <div id="sg-modal-title" className="mh-name">{strategy.name}</div>
              <DirectionBadge value={strategy.direction} />
            </div>
          </div>
          <div className="mh-actions">
            <button className="button ghost" type="button">Save</button>
            <button
              className="button"
              type="button"
              onClick={() => onApply?.(legsForApply.legs, legsForApply.netPremium)}
            >
              Apply
            </button>
            <button className="button ghost" type="button" onClick={onClose}>Close</button>
          </div>
        </div>

        {/* Chart — full width, no card */}
        <section style={{ marginTop: 8, marginBottom: 16 }}>
          <MiniPayoffChart rows={rows} spot={spot} sigma={sigma} currency={currency} />
        </section>

        {/* Architecture */}
        <section className="card dense" style={{ marginBottom: 16 }}>
          <div className="section-title">Architecture</div>
          <div className="sg-specs" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
            <div className="tile">
              <div className="sublabel">Composition</div>
              <div className="value">
                {rows
                  .filter((r) => Number(r.volume) > 0)
                  .map((r) => `${r.position}×${r.volume}`)
                  .join(" · ") || "—"}
              </div>
            </div>
            <div className="tile">
              <div className="sublabel">Breakeven(s)</div>
              {/* keep empty until you drop the formula */}
              <div className="value">—</div>
            </div>
            <div className="tile">
              <div className="sublabel">Max Profit</div>
              <div className="value">—</div>
            </div>
            <div className="tile">
              <div className="sublabel">Max Loss</div>
              <div className="value">—</div>
            </div>
            <div className="tile">
              <div className="sublabel">Risk Profile</div>
              <div className="value">{strategy.direction || "—"}</div>
            </div>
            <div className="tile">
              <div className="sublabel">Greeks Exposure</div>
              <div className="value">Δ/Γ/Θ/ν —</div>
            </div>
            <div className="tile">
              <div className="sublabel">Margin Requirement</div>
              <div className="value">—</div>
            </div>
          </div>
        </section>

        {/* Configuration */}
        <section className="card dense">
          <div className="section-title">Configuration</div>
          <div className="sg-table">
            <div className="sg-th">Position</div>
            <div className="sg-th">Strike</div>
            <div className="sg-th">Volume</div>
            <div className="sg-th">Premium</div>

            {rows.map((r, i) => (
              <Row
                key={i}
                row={r}
                onStrike={(v) => edit(i, "strike", v)}
                onVol={(v) => edit(i, "volume", v)}
                onPremium={(v) => edit(i, "premium", v)}
                currency={currency}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ---------- table row ---------- */
function Row({ row, onStrike, onVol, onPremium, currency }) {
  return (
    <>
      <div className="sg-td strong">{row.position}</div>
      <div className="sg-td">
        <input
          className="field"
          type="number"
          step="0.01"
          placeholder="Strike"
          value={row.strike ?? ""}
          onChange={(e) => onStrike(e.target.value)}
        />
      </div>
      <div className="sg-td">
        <input
          className="field"
          type="number"
          step="1"
          min="0"
          placeholder="0"
          value={row.volume ?? ""}
          onChange={(e) => onVol(e.target.value)}
        />
      </div>
      <div className="sg-td">
        <div style={{ display: "grid", gridTemplateColumns: "16px 1fr", alignItems: "center", gap: 6 }}>
          <span className="muted" style={{ justifySelf: "center" }}>$</span>
          <input
            className="field"
            type="number"
            step="0.01"
            placeholder="0"
            value={row.premium ?? ""}
            onChange={(e) => onPremium(e.target.value)}
          />
        </div>
      </div>
    </>
  );
}
