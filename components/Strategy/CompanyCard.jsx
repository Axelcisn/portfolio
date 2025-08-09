"use client";

import { useMemo, useState } from "react";
import TickerSearch from "./TickerSearch";

function fmtMoney(v, ccy = "USD") {
  if (v == null || Number.isNaN(+v)) return "$0.00";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: ccy || "USD",
      maximumFractionDigits: 2,
    }).format(Number(v));
  } catch {
    return `$${Number(v).toFixed(2)}`;
  }
}

export default function CompanyCard({
  value,
  market, // { riskFree, mrp }
  onConfirm, // (companyObj)
  onHorizonChange,
  onIvSourceChange,
  onIvValueChange,
}) {
  const [selected, setSelected] = useState(null); // from search: {symbol, name}
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [ccy, setCcy] = useState(value?.currency ?? "");
  const [spot, setSpot] = useState(value?.spot ?? null);
  const [beta, setBeta] = useState(value?.beta ?? null);
  const [ivLive, setIvLive] = useState(null);
  const [ivHist, setIvHist] = useState(null);

  const capm = useMemo(() => {
    if (
      market?.riskFree == null ||
      market?.mrp == null ||
      beta == null ||
      Number.isNaN(+beta)
    )
      return 0;
    // riskFree / mrp assumed entered as percentages (e.g., 2.7, 5.5)
    const r = Number(market.riskFree);
    const erp = Number(market.mrp);
    return r + beta * erp;
  }, [market?.riskFree, market?.mrp, beta]);

  async function fetchCompany(symbol) {
    if (!symbol) return;
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(`/api/company?symbol=${encodeURIComponent(symbol)}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `HTTP ${res.status}`);
      }
      const j = await res.json();
      // j: { symbol,name,spot,currency,high52,low52,beta,ivLive,ivHist,driftHist,fxToEUR,fxSource }
      setCcy(j.currency || "");
      setSpot(j.spot ?? null);
      setBeta(j.beta ?? null);
      setIvLive(j.ivLive ?? null);
      setIvHist(j.ivHist ?? null);

      // choose an IV to feed parent (prefer live)
      const chosenIv = j.ivLive ?? j.ivHist ?? null; // decimal
      if (chosenIv != null) onIvValueChange?.(chosenIv);
      onIvSourceChange?.(j.ivLive != null ? "live" : "hist");

      onConfirm?.({
        symbol: j.symbol,
        name: j.name,
        spot: j.spot,
        currency: j.currency,
        beta: j.beta,
        high52: j.high52,
        low52: j.low52,
      });
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <div className="mb-3 text-xl font-semibold">Company</div>

      <div className="mb-2 text-sm font-medium">Company / Ticker</div>
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <TickerSearch
            value={value?.symbol || ""}
            onSelect={(it) => setSelected(it)}
            placeholder="AAPL, TSLA, RACE…"
          />
        </div>
        <button
          type="button"
          disabled={loading || !selected?.symbol}
          onClick={() => fetchCompany(selected?.symbol)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? "Loading…" : "Confirm"}
        </button>
      </div>

      {err && (
        <div className="mt-2 text-sm text-red-400">
          {err}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-4">
        {/* Currency */}
        <div>
          <div className="mb-1 text-sm text-neutral-400">Currency</div>
          <input
            value={ccy || ""}
            readOnly
            className="w-full rounded-lg bg-transparent border border-neutral-700 px-3 py-2"
          />
        </div>

        {/* D (drift - left empty for now / manual) */}
        <div>
          <div className="mb-1 text-sm text-neutral-400">D</div>
          <input
            placeholder=""
            className="w-full rounded-lg bg-transparent border border-neutral-700 px-3 py-2"
            onChange={(e) => {
              // hook this up if you want manual drift
            }}
          />
        </div>

        {/* Spot */}
        <div>
          <div className="mb-1 text-sm text-neutral-400">S</div>
          <input
            value={fmtMoney(spot, ccy || "USD")}
            readOnly
            className="w-full rounded-lg bg-transparent border border-neutral-700 px-3 py-2"
          />
        </div>

        {/* IV source picker + value supplied upward by onIvValueChange */}
        <div>
          <div className="mb-1 text-sm text-neutral-400">σ</div>
          <div className="flex gap-2">
            <select
              className="flex-1 rounded-lg bg-transparent border border-neutral-700 px-3 py-2"
              onChange={(e) => {
                const src = e.target.value;
                onIvSourceChange?.(src);
                const v = src === "live" ? ivLive : ivHist;
                if (v != null) onIvValueChange?.(v);
              }}
              defaultValue={ivLive != null ? "live" : "hist"}
            >
              <option value="live">Live IV</option>
              <option value="hist">Hist vol</option>
              <option value="manual">Manual</option>
            </select>
            <input
              type="number"
              step="0.01"
              placeholder="0.30 = 30%"
              className="w-36 rounded-lg bg-transparent border border-neutral-700 px-3 py-2"
              onChange={(e) => {
                const v = e.target.value === "" ? null : Number(e.target.value);
                onIvSourceChange?.("manual");
                onIvValueChange?.(v);
              }}
            />
          </div>
          <div className="mt-1 text-xs text-neutral-400">
            Live: {ivLive != null ? (ivLive * 100).toFixed(2) + "%" : "—"} · Hist:{" "}
            {ivHist != null ? (ivHist * 100).toFixed(2) + "%" : "—"}
          </div>
        </div>

        {/* Beta */}
        <div>
          <div className="mb-1 text-sm text-neutral-400">β</div>
          <input
            value={beta ?? ""}
            readOnly
            className="w-full rounded-lg bg-transparent border border-neutral-700 px-3 py-2"
          />
        </div>

        {/* Days (horizon) */}
        <div>
          <div className="mb-1 text-sm text-neutral-400">Days</div>
          <input
            type="number"
            min={1}
            defaultValue={30}
            className="w-full rounded-lg bg-transparent border border-neutral-700 px-3 py-2"
            onChange={(e) => onHorizonChange?.(Number(e.target.value))}
          />
        </div>

        {/* CAPM */}
        <div>
          <div className="mb-1 text-sm text-neutral-400">CAPM</div>
          <input
            value={(capm || 0).toFixed(2)}
            readOnly
            className="w-full rounded-lg bg-transparent border border-neutral-700 px-3 py-2"
          />
        </div>
      </div>
    </div>
  );
}
