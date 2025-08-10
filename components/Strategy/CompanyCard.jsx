// components/Strategy/CompanyCard.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * CompanyCard
 * - Full‑width search bar + Confirm
 * - Below: one responsive row with Currency · Spot (S) · Time (days) · Volatility
 * - Emits:
 *    onConfirm(companyObj)
 *    onHorizonChange(days)
 *    onIvSourceChange(source)   // "live" | "manual"
 *    onIvValueChange(value)     // decimal annualized σ (e.g., 0.30)
 */
export default function CompanyCard({
  value = null,
  market = null, // not used here, kept for API parity
  onConfirm,
  onHorizonChange,
  onIvSourceChange,
  onIvValueChange,
}) {
  /* ---------- local state ---------- */
  const [symbol, setSymbol] = useState(value?.symbol || "");
  const [company, setCompany] = useState(value || null);

  const [currency, setCurrency] = useState(value?.currency || "");
  const [spot, setSpot] = useState(
    Number.isFinite(+value?.spot) ? +value.spot : null
  );

  const [horizon, setHorizon] = useState(30);

  const [ivSource, setIvSource] = useState("live"); // "live" | "manual"
  const [ivManual, setIvManual] = useState("");     // text box; parse to decimal
  const [ivLive, setIvLive] = useState(null);       // last fetched IV (decimal)

  const [busy, setBusy] = useState(false);

  /* ---------- helpers ---------- */
  const num = (v) => {
    const n = parseFloat(String(v ?? "").replace(",", "."));
    return Number.isFinite(n) ? n : NaN;
  };

  const pretty = (n, d = 2) =>
    Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";

  const ivShown = useMemo(() => {
    if (ivSource === "manual") {
      const n = num(ivManual);
      return Number.isFinite(n) ? n : null;
    }
    return Number.isFinite(ivLive) ? ivLive : null;
  }, [ivSource, ivManual, ivLive]);

  /* propagate outward whenever inputs change */
  useEffect(() => {
    onHorizonChange?.(Number.isFinite(+horizon) ? +horizon : 30);
  }, [horizon, onHorizonChange]);

  useEffect(() => {
    onIvSourceChange?.(ivSource);
  }, [ivSource, onIvSourceChange]);

  useEffect(() => {
    onIvValueChange?.(ivShown ?? null);
  }, [ivShown, onIvValueChange]);

  /* ---------- actions ---------- */
  async function fetchCompany(symRaw) {
    const sym = (symRaw || symbol || "").trim().toUpperCase();
    if (!sym) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/company?symbol=${encodeURIComponent(sym)}`, {
        cache: "no-store",
      });
      const j = await r.json();

      // API always returns a normalized top-level object
      const next = {
        symbol: j.symbol || sym,
        name: j.name || sym,
        exchange: j.exchange || "",
        currency: j.currency || "",
        spot: Number.isFinite(+j.spot) ? +j.spot : null,
        prevClose: Number.isFinite(+j.prevClose) ? +j.prevClose : null,
        change: Number.isFinite(+j.change) ? +j.change : null,
        changePct: Number.isFinite(+j.changePct) ? +j.changePct : null,
        marketSession: j.marketSession || "At close",
        logoUrl: j.logoUrl || null,
      };

      setCompany(next);
      setCurrency(next.currency || "");
      setSpot(next.spot ?? null);
      setSymbol(next.symbol);

      // Optional: try live IV if available on your backend
      try {
        const vi = await fetch(`/api/volatility?symbol=${encodeURIComponent(next.symbol)}`, { cache: "no-store" });
        if (vi.ok) {
          const vj = await vi.json();
          // accept common shapes: {iv:0.3} or {data:{iv:0.3}}
          const val = Number(
            vj?.iv ?? vj?.data?.iv ?? vj?.data?.ivAnnual ?? vj?.sigma
          );
          if (Number.isFinite(val)) setIvLive(val);
        }
      } catch {
        /* ignore IV errors silently */
      }

      onConfirm?.(next);
    } catch {
      // If the API is unreachable, keep previous values (no red error in UI)
      onConfirm?.(company || null);
    } finally {
      setBusy(false);
    }
  }

  // Update outward company when user edits Spot manually (instant feedback)
  useEffect(() => {
    if (!company) return;
    const next = { ...company, spot: Number.isFinite(+spot) ? +spot : null };
    onConfirm?.(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spot]);

  /* ---------- UI ---------- */
  return (
    <section className="card" aria-labelledby="company-title">
      <h3 id="company-title">Company</h3>

      {/* Search bar + Confirm (Google‑style full width + side button) */}
      <div className="row" style={{ gap: 12 }}>
        <input
          className="field"
          placeholder="Type a ticker (e.g., AAPL, AMZN)…"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === "Enter") fetchCompany(e.currentTarget.value);
          }}
          aria-label="Ticker"
          style={{ flex: 1, borderRadius: 9999 }}
        />
        <button
          className="button"
          onClick={() => fetchCompany(symbol)}
          disabled={!symbol || busy}
          aria-label="Confirm company"
          style={{ minWidth: 110, borderRadius: 14 }}
        >
          {busy ? "Loading…" : "Confirm"}
        </button>
      </div>

      {/* Selected line */}
      {company && (
        <div className="small" style={{ marginTop: 8 }}>
          <span className="muted">Selected:&nbsp;</span>
          <strong>{company.symbol}</strong> — {company.name}
          {company.exchange ? ` · ${company.exchange}` : ""}
        </div>
      )}

      {/* Controls row: Currency · S · Time · Volatility */}
      <div
        className="company-grid"
        style={{
          display: "grid",
          gap: 12,
          marginTop: 12,
          gridTemplateColumns: "repeat(4, minmax(160px, 1fr))",
        }}
      >
        {/* Currency (readonly hint) */}
        <div className="vgroup">
          <label className="sublabel">Currency</label>
          <input
            className="field"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            aria-label="Currency"
            placeholder="—"
          />
        </div>

        {/* Spot (S) */}
        <div className="vgroup">
          <label className="sublabel">S</label>
          <input
            className="field"
            inputMode="decimal"
            placeholder="0.00"
            value={spot ?? ""}
            onChange={(e) => setSpot(num(e.target.value))}
            aria-label="Spot price"
          />
        </div>

        {/* Time (days) */}
        <div className="vgroup">
          <label className="sublabel">Time</label>
          <input
            className="field"
            inputMode="numeric"
            value={horizon}
            onChange={(e) => setHorizon(Math.max(1, parseInt(e.target.value || "0", 10) || 0))}
            aria-label="Time in days"
          />
        </div>

        {/* Volatility (source + value) */}
        <div className="vgroup">
          <label className="sublabel">Volatility</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", rowGap: 8 }}>
            <select
              className="field"
              value={ivSource}
              onChange={(e) => setIvSource(e.target.value)}
              aria-label="Volatility source"
            >
              <option value="live">Implied Volatility</option>
              <option value="manual">Manual</option>
            </select>

            {ivSource === "manual" ? (
              <input
                className="field"
                inputMode="decimal"
                placeholder="0.30 = 30%"
                value={ivManual}
                onChange={(e) => setIvManual(e.target.value)}
                aria-label="Manual volatility (decimal)"
              />
            ) : (
              <input
                className="field"
                value={
                  ivShown != null
                    ? `${pretty(ivShown, 2)} = ${(ivShown * 100).toFixed(0)}%`
                    : "—"
                }
                readOnly
                aria-label="Live implied volatility"
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
