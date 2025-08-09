// components/Strategy/CompanyCard.jsx
"use client";

import { useEffect, useMemo, useState } from "react";
import TickerSearch from "./TickerSearch";

export default function CompanyCard({
  value,
  market,
  onConfirm,
  onHorizonChange,
  onIvSourceChange,
  onIvValueChange,
}) {
  const [picked, setPicked] = useState(null);
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState(null);
  const [err, setErr] = useState("");

  // keep external value in sync (if provided)
  useEffect(() => {
    if (value?.symbol) {
      setPicked({ symbol: value.symbol, name: value.name });
      setDetails({
        currency: value.currency,
        spot: value.spot,
        beta: value.beta ?? null,
      });
    }
  }, [value]);

  async function fetchCompany(sym) {
    setErr("");
    setLoading(true);
    try {
      const r = await fetch(`/api/company?symbol=${encodeURIComponent(sym)}`, {
        cache: "no-store",
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "fetch failed");

      setDetails({
        currency: j.currency || "",
        spot: j.spot ?? null,
        beta: j.beta ?? null,
        name: j.name || sym,
        exchange: j.exchange || "",
        via: j.via || "",
      });

      // push up
      onConfirm?.({
        symbol: j.symbol,
        name: j.name,
        spot: j.spot,
        currency: j.currency,
        beta: j.beta,
      });

      // set a default IV (live if available -> otherwise historical)
      if (typeof j.ivLive === "number") {
        onIvSourceChange?.("live");
        onIvValueChange?.(j.ivLive);
      } else if (typeof j.ivHist === "number") {
        onIvSourceChange?.("hist");
        onIvValueChange?.(j.ivHist);
      }
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  const capm = useMemo(() => {
    const rf = +market?.riskFree ?? NaN;
    const mrp = +market?.mrp ?? NaN;
    const beta = +details?.beta ?? NaN;
    if (Number.isFinite(rf) && Number.isFinite(mrp) && Number.isFinite(beta)) {
      return rf + beta * mrp;
    }
    return null;
  }, [market, details?.beta]);

  return (
    <div className="card">
      <div className="card-title">Company / Ticker</div>

      <TickerSearch
        value={picked?.symbol || ""}
        onPick={(r) => {
          setPicked(r);
          setDetails(null);
          setErr("");
        }}
      />

      <button
        disabled={!picked?.symbol || loading}
        onClick={() => fetchCompany(picked.symbol)}
        style={{ marginTop: 8 }}
      >
        {loading ? "Loading…" : "Confirm"}
      </button>

      {picked?.symbol && details && (
        <div style={{ marginTop: 8 }}>
          <div>
            Selected: <strong>{picked.symbol}</strong> — {details.name || ""}
          </div>
          <div>
            Exchange/Currency: {details.exchange || "—"} ·{" "}
            {details.currency || "—"}
          </div>
          <div>Spot: {details.spot != null ? `$${details.spot}` : "—"}</div>
          <div>β: {details.beta != null ? details.beta.toFixed(2) : "—"}</div>
          <div>
            CAPM: {capm != null ? capm.toFixed(2) : "0.00"}
          </div>
          <div style={{ opacity: 0.6, fontSize: 12 }}>
            Source: {details.via || "—"}
          </div>
        </div>
      )}

      {err && (
        <div style={{ color: "tomato", marginTop: 8 }}>
          {err}
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <label style={{ display: "block", marginBottom: 4 }}>Days</label>
        <input
          type="number"
          defaultValue={30}
          min={1}
          onChange={(e) => onHorizonChange?.(Math.max(1, +e.target.value || 1))}
          style={{ width: 120 }}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <label style={{ display: "block", marginBottom: 4 }}>σ (IV)</label>
        <select
          onChange={(e) => onIvSourceChange?.(e.target.value)}
          defaultValue="live"
          style={{ width: 140, marginRight: 8 }}
        >
          <option value="live">Live IV</option>
          <option value="hist">Hist IV</option>
          <option value="manual">Manual</option>
        </select>
        <input
          type="number"
          step="0.01"
          placeholder="0.30 = 30%"
          onChange={(e) => onIvValueChange?.(+e.target.value || 0)}
          style={{ width: 140 }}
        />
      </div>
    </div>
  );
}
