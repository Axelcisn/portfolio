// components/Strategy/StrategyModal.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DirectionBadge from "./DirectionBadge";
import Chart from "./Chart";
import { fmtCur, fmtPct, fmtNum } from "../../utils/format";

/** Map position -> Chart leg key + sign for premium */
const POS_MAP = {
  "Long Call": { key: "lc", sign: +1 },
  "Short Call": { key: "sc", sign: -1 },
  "Long Put": { key: "lp", sign: +1 },
  "Short Put": { key: "sp", sign: -1 },
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
      sum += map.sign * vol * prem;
    }
  });
  return sum;
}

export default function StrategyModal({ strategy, env, onApply, onClose }) {
  const { spot, sigma, T, riskFree, mcStats, currency } = env || {};
  const [rows, setRows] = useState(() => {
    // initialise strikes around spot if null
    const s = Number(spot) || 0;
    return (strategy.legs || []).map((r) => {
      if (!Number.isFinite(r.strike) && s > 0) {
        // default heuristics
        const dir = strategy.direction;
        const pos = r.position;
        let k = s;
        if (pos.includes("Call")) k = dir === "Bullish" ? s * 1.05 : s * 1.03;
        if (pos.includes("Put")) k = dir === "Bearish" ? s * 0.95 : s * 0.97;
        return { ...r, strike: Math.round(k * 100) / 100, volume: r.volume ?? 1 };
      }
      return { ...r, volume: r.volume ?? 1 };
    });
  });

  // Update chart legs & premium as user types (no extra triggers)
  const chartLegs = useMemo(() => toChartLegs(rows), [rows]);
  const totalPrem = useMemo(() => netPremium(rows), [rows]);

  // Close on ESC / click outside
  const dialogRef = useRef(null);
  useEffect(() => {
    const onEsc = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onEsc);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onEsc);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  // Editable cell
  const edit = (i, field, v) => {
    setRows((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: v === "" ? "" : Number(v) };
      return next;
    });
  };

  return (
    <div className="modal-root" role="dialog" aria-modal="true" aria-labelledby="sg-modal-title">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-sheet" ref={dialogRef}>
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
            <button className="button ghost" type="button" onClick={() => {/* future: save preset */}}>Save</button>
            <button
              className="button"
              type="button"
              onClick={() => onApply?.(chartLegs, totalPrem)}
              disabled={!spot || !Number.isFinite(sigma) || !Number.isFinite(T)}
            >
              Apply
            </button>
            <button className="button ghost" type="button" onClick={onClose}>Close</button>
          </div>
        </div>

        {/* Body */}
        <div className="modal-body">
          {/* Left: payoff */}
          <div className="modal-col">
            <div className="card padless canvas">
              <div style={{ height: 280 }}>
                <Chart
                  spot={spot}
                  legs={chartLegs}
                  riskFree={riskFree ?? 0}
                  carryPremium={false}
                  mu={null}
                  sigma={Number.isFinite(sigma) ? sigma : 0}
                  T={Number.isFinite(T) ? T : 0}
                  mcStats={mcStats}
                  netPremium={totalPrem}
                />
              </div>
            </div>
          </div>

          {/* Right: editable config table */}
          <div className="modal-col">
            <div className="card dense">
              <div className="section-title">Configuration</div>
              <div className="sg-table">
                <div className="sg-th">Position</div>
                <div className="sg-th">Strike</div>
                <div className="sg-th">Volume</div>
                <div className="sg-th">Premium</div>

                {rows.map((r, i) => (
                  <FragmentRow
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

        {/* Footer specs (lightweight placeholders; wire to calc when ready) */}
        <div className="modal-foot">
          <div className="card dense">
            <div className="section-title">Architecture</div>
            <div className="sg-specs">
              <div className="spec">
                <div className="k">Composition</div>
                <div className="v">
                  {rows.map((r) => `${r.position}×${r.volume ?? 0}`).join(" · ")}
                </div>
              </div>
              <div className="spec">
                <div className="k">Risk Profile</div>
                <div className="v">{strategy.direction}</div>
              </div>
              <div className="spec">
                <div className="k">Max Profit / Max Loss</div>
                <div className="v">—</div>
              </div>
              <div className="spec">
                <div className="k">Breakeven(s)</div>
                <div className="v">—</div>
              </div>
              <div className="spec">
                <div className="k">Greeks Exposure</div>
                <div className="v">Δ/Γ/Θ/ν —</div>
              </div>
              <div className="spec">
                <div className="k">Margin Requirement</div>
                <div className="v">—</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Row renderer for the editable config table */
function FragmentRow({ row, onStrike, onVol, onPremium, currency }) {
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
        />
      </div>
      <div className="sg-td">
        <input
          className="field"
          type="number"
          step="1"
          value={row.volume ?? ""}
          onChange={(e) => onVol(e.target.value)}
        />
      </div>
      <div className="sg-td">
        <input
          className="field"
          type="number"
          step="0.01"
          placeholder={currency}
          value={row.premium ?? ""}
          onChange={(e) => onPremium(e.target.value)}
        />
      </div>
    </>
  );
}
