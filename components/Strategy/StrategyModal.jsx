// components/Strategy/StrategyModal.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DirectionBadge from "./DirectionBadge";
import Chart from "./Chart";

/* -------------------------
   Small local format helpers
   ------------------------- */
const ccySign = (ccy) =>
  ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : ccy === "JPY" ? "¥" : "$";

function fmtCur(v, ccy = "USD") {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  const sign = ccySign(ccy);
  return `${sign}${n.toFixed(Math.abs(n) >= 100 ? 0 : 2)}`;
}
function fmtPct(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(0)}%`;
}

/* -------------------------
   Position → chart-legs map
   ------------------------- */
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
    const on = !!r.enabled && qty > 0 && Number.isFinite(k);
    obj[map.key] = { enabled: on, K: on ? k : NaN, qty: on ? qty : 0 };
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
    if (r.enabled && Number.isFinite(vol) && Number.isFinite(prem)) {
      sum += map.sign * vol * prem;
    }
  });
  return sum;
}

/* -------------------------
   Small UI atoms
   ------------------------- */
function MetricTile({ label, value }) {
  return (
    <div className="card dense" style={{ padding: 14 }}>
      <div className="small muted" style={{ marginBottom: 6 }}>{label}</div>
      <div className="value">{value ?? "—"}</div>
    </div>
  );
}

function Spec({ title, children }) {
  return (
    <div className="card dense">
      <div className="small muted" style={{ marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

/* =======================================================
   Strategy Modal
   ======================================================= */
export default function StrategyModal({ strategy, env, onApply, onClose }) {
  const {
    spot = null,
    sigma = null,
    T = null,
    riskFree = 0,
    mcStats = null,
    currency = "USD",
    high52 = null,
    low52 = null,
  } = env || {};

  // Initialize editable rows
  const [rows, setRows] = useState(() => {
    const s = Number(spot) || 0;
    return (strategy?.legs || []).map((r) => {
      let strike = r.strike;
      if (!Number.isFinite(strike) && s > 0) {
        // light heuristic defaults around spot
        const dir = strategy?.direction;
        if (r.position.includes("Call")) strike = Math.round((dir === "Bullish" ? s * 1.05 : s * 1.03) * 100) / 100;
        if (r.position.includes("Put")) strike = Math.round((dir === "Bearish" ? s * 0.95 : s * 0.97) * 100) / 100;
      }
      return {
        position: r.position,
        strike: strike ?? "",
        volume: r.volume ?? 1,
        premium: r.premium ?? 0,
        enabled: r.enabled ?? true,
      };
    });
  });

  // Derived
  const chartLegs = useMemo(() => toChartLegs(rows), [rows]);
  const totalPrem = useMemo(() => netPremium(rows), [rows]);

  // Close on ESC & backdrop; lock background scroll
  const sheetRef = useRef(null);
  useEffect(() => {
    const onEsc = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onEsc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onEsc);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  // Edit helpers
  const setField = (i, key, val) =>
    setRows((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [key]: key === "enabled" ? !!val : val === "" ? "" : Number(val) };
      return next;
    });

  return (
    <div className="modal-root" role="dialog" aria-modal="true" aria-labelledby="sg-modal-title">
      <div className="modal-backdrop" onClick={onClose} />

      {/* Sheet: grid for header / scrollable body */}
      <div
        className="modal-sheet"
        ref={sheetRef}
        style={{
          display: "grid",
          gridTemplateRows: "auto 1fr",
          height: "92vh",
          maxHeight: "92vh",
          width: "min(1200px, 94vw)",
        }}
      >
        {/* Header */}
        <div
          className="modal-head"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 16px",
            borderBottom: "1px solid var(--border)",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="mh-icon">{strategy?.icon && <strategy.icon aria-hidden="true" />}</div>
            <div>
              <div id="sg-modal-title" className="mh-name" style={{ fontWeight: 700 }}>
                {strategy?.name || "Strategy"}
              </div>
              <DirectionBadge value={strategy?.direction || "Neutral"} />
            </div>
          </div>
          <div className="mh-actions" style={{ display: "flex", gap: 8 }}>
            <button className="button ghost" type="button" onClick={() => { /* future: save preset */ }}>Save</button>
            <button
              className="button"
              type="button"
              onClick={() => onApply?.(toChartLegs(rows), netPremium(rows))}
              disabled={!spot || !Number.isFinite(sigma) || !Number.isFinite(T)}
            >
              Apply
            </button>
            <button className="button ghost" type="button" onClick={onClose}>Close</button>
          </div>
        </div>

        {/* Scrollable body */}
        <div
          className="modal-body"
          style={{
            overflowY: "auto",
            padding: 16,
            display: "grid",
            gap: 16,
          }}
        >
          {/* ===== Chart (no box, integrated) ===== */}
          <div className="sgm-chart" style={{ paddingTop: 6 }}>
            <div style={{ height: 380 }}>
              <Chart
                spot={Number(spot) || 0}
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

          {/* Metric strip */}
          <div
            className="grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, minmax(0,1fr))",
              gap: 12,
            }}
          >
            <MetricTile label="Underlying" value={fmtCur(spot, currency)} />
            <MetricTile label="Max Profit" value="—" />
            <MetricTile label="Max Loss" value="—" />
            <MetricTile label="Win Rate" value="—" />
            <MetricTile label="Breakeven" value="—" />
          </div>

          {/* ===== Architecture ===== */}
          <section className="card" style={{ padding: 16 }}>
            <div className="section-title" style={{ marginBottom: 10 }}>Architecture</div>
            <div
              className="grid"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0,1fr))",
                gap: 12,
              }}
            >
              <Spec title="Composition">
                <div className="value" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {rows.length ? rows.map((r) => `${r.position}×${r.enabled ? r.volume ?? 0 : 0}`).join(" · ") : "—"}
                </div>
              </Spec>

              <Spec title="Breakeven(s)">
                <div className="value">—</div>
              </Spec>

              <Spec title="Max Profit">
                <div className="value">—</div>
              </Spec>

              <Spec title="Max Loss">
                <div className="value">—</div>
              </Spec>

              <Spec title="Risk Profile">
                <div className="value">{strategy?.direction || "—"}</div>
              </Spec>

              <Spec title="Greeks Exposure">
                <div className="value">Δ/Γ/Θ/ν —</div>
              </Spec>

              {/* 52W High / Low (vertical columns with a vertical divider) */}
              <Spec title="52W High / Low">
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1px 1fr",
                    alignItems: "stretch",
                    gap: 12,
                    minHeight: 52,
                  }}
                >
                  {/* High */}
                  <div style={{ display: "grid", gridTemplateRows: "auto auto", gap: 6 }}>
                    <div className="small muted">High</div>
                    <div className="value">{fmtCur(high52, currency)}</div>
                  </div>

                  {/* Divider */}
                  <div style={{ width: 1, background: "var(--border)" }} />

                  {/* Low */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateRows: "auto auto",
                      gap: 6,
                      textAlign: "right",
                    }}
                  >
                    <div className="small muted">Low</div>
                    <div className="value">{fmtCur(low52, currency)}</div>
                  </div>
                </div>
              </Spec>

              <Spec title="Margin Requirement">
                <div className="value">—</div>
              </Spec>
            </div>
          </section>

          {/* ===== Configuration ===== */}
          <section className="card" style={{ padding: 16 }}>
            <div className="section-title" style={{ marginBottom: 12 }}>Configuration</div>

            {/* Table header */}
            <div
              className="sg-table"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 0.8fr 1fr 60px",
                gap: 10,
                alignItems: "center",
                marginBottom: 8,
                fontWeight: 600,
                opacity: 0.9,
              }}
            >
              <div className="small">Position</div>
              <div className="small">Strike</div>
              <div className="small">Volume</div>
              <div className="small">Premium</div>
              <div className="small" style={{ textAlign: "center" }}>On</div>
            </div>

            {/* Rows */}
            <div
              style={{
                display: "grid",
                gridAutoRows: "minmax(40px,auto)",
                rowGap: 10,
              }}
            >
              {rows.map((r, i) => (
                <div
                  key={`${r.position}-${i}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 0.8fr 1fr 60px",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <div className="sg-td strong">{r.position}</div>

                  <div className="sg-td">
                    <input
                      className="field"
                      type="number"
                      step="0.01"
                      placeholder="Strike"
                      value={r.strike}
                      onChange={(e) => setField(i, "strike", e.target.value)}
                    />
                  </div>

                  <div className="sg-td">
                    <input
                      className="field"
                      type="number"
                      step="1"
                      placeholder="0"
                      value={r.volume}
                      onChange={(e) => setField(i, "volume", e.target.value)}
                    />
                  </div>

                  <div className="sg-td">
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="small muted">{ccySign(currency)}</span>
                      <input
                        className="field"
                        type="number"
                        step="0.01"
                        placeholder="0"
                        value={r.premium}
                        onChange={(e) => setField(i, "premium", e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="sg-td" style={{ textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={!!r.enabled}
                      onChange={(e) => setField(i, "enabled", e.target.checked)}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Net premium */}
            <div className="row-right small" style={{ marginTop: 12 }}>
              <span className="muted">Net Premium:</span>&nbsp;
              <strong>{fmtCur(totalPrem, currency)}</strong>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
