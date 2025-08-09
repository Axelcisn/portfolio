// components/Strategy/CompanyCard.jsx
"use client";

import { useEffect, useMemo, useState } from "react";
import TickerSearch from "./TickerSearch";

const EX_NAMES = {
  NMS: "NASDAQ",
  NGM: "NASDAQ GM",
  NCM: "NASDAQ CM",
  NYQ: "NYSE",
  ASE: "AMEX",
  PCX: "NYSE Arca",
  LSE: "LSE",
  MIL: "Milan",
  BUE: "Buenos Aires",
};

const BETA_SOURCES = [
  { value: "yahoo", label: "Yahoo Finance (exact)" },
  { value: "calc", label: "Calculated (1Y daily vs. index)" },
  { value: "manual", label: "Manual" },
  // { value: "tradingview", label: "TradingView (coming soon)", disabled: true },
  // { value: "marketwatch", label: "MarketWatch (coming soon)", disabled: true },
];

export default function CompanyCard({
  value = null,
  market = {},
  onConfirm = () => {},
}) {
  const [typed, setTyped] = useState(value?.symbol || "");
  const [picked, setPicked] = useState(null);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [currency, setCurrency] = useState(value?.currency || "");
  const [spot, setSpot] = useState(value?.spot || 0);

  const [betaSource, setBetaSource] = useState("yahoo");
  const [beta, setBeta] = useState(null);
  const [betaNote, setBetaNote] = useState("");

  const exchLabel = picked?.exchange
    ? (EX_NAMES[picked.exchange] || picked.exchange)
    : null;

  async function fetchCompany(sym) {
    setErr("");
    setLoading(true);
    try {
      const r = await fetch(`/api/company?symbol=${encodeURIComponent(sym)}`, { cache: "no-store" });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error || `Company request failed (${r.status})`);
      }
      const j = await r.json();
      setCurrency(j.currency || "");
      setSpot(Number(j.spot || 0));

      onConfirm({
        symbol: j.symbol,
        name: j.name,
        exchange: picked?.exchange || null,
        currency: j.currency,
        spot: j.spot,
        high52: j.high52 ?? null,
        low52: j.low52 ?? null,
        beta: j.beta ?? null, // note: may be null; we separately fetch beta below
      });
    } finally {
      setLoading(false);
    }
  }

  async function fetchBeta(sym, source) {
    setBeta(null);
    setBetaNote("");
    try {
      const r = await fetch(`/api/beta?symbol=${encodeURIComponent(sym)}&source=${encodeURIComponent(source)}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `Beta request failed (${r.status})`);
      if (j?.beta != null && isFinite(j.beta)) setBeta(j.beta);
      if (j?.note) setBetaNote(j.note);
    } catch (e) {
      setBeta(null);
      setBetaNote(String(e.message || e));
    }
  }

  async function confirm(symMaybe) {
    const sym = (symMaybe || picked?.symbol || typed).trim().toUpperCase();
    if (!sym) return;
    await fetchCompany(sym);
    await fetchBeta(sym, betaSource);
  }

  useEffect(() => {
    // whenever source changes, refetch for current symbol
    if (value?.symbol || picked?.symbol || typed) {
      const sym = (picked?.symbol || value?.symbol || typed).trim().toUpperCase();
      if (sym) fetchBeta(sym, betaSource);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [betaSource]);

  const spotDisplay = useMemo(() => {
    if (!isFinite(spot) || spot <= 0) return "$0.00";
    // best-effort currency formatting
    const c = (currency || "USD").toUpperCase();
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: c,
        maximumFractionDigits: 2,
      }).format(spot);
    } catch {
      return `$${spot.toFixed(2)}`;
    }
  }, [spot, currency]);

  return (
    <div className="rounded border border-gray-300 p-4">
      <h2 className="mb-3 text-xl font-semibold">Company</h2>

      <div className="mb-2">
        <label className="mb-1 block text-sm font-medium">Company / Ticker</label>
        <TickerSearch
          value={typed}
          onPick={(item) => {
            setPicked(item);
            setTyped(item.symbol || "");
            setErr("");
          }}
          onEnter={(sym) => {
            setTyped(sym);
            confirm(sym);
          }}
          placeholder="AAPL, ENEL.MI, TSLA…"
        />

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => confirm()}
            disabled={loading}
            className="rounded bg-blue-600 px-3 py-2 text-white disabled:opacity-50"
          >
            {loading ? "Loading…" : "Confirm"}
          </button>
          {picked?.symbol && (
            <span className="text-sm text-gray-700">
              Selected: <strong>{picked.symbol}</strong>
              {picked.name ? ` — ${picked.name}` : ""}
              {exchLabel ? ` • ${exchLabel}` : ""}
            </span>
          )}
        </div>

        {err && <div className="mt-2 text-sm text-red-600">{err}</div>}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm text-gray-600">Currency</label>
          <input value={currency || ""} readOnly className="w-full rounded border border-gray-300 px-3 py-2 text-black"/>
        </div>
        <div>
          <label className="mb-1 block text-sm text-gray-600">S (Spot)</label>
          <input value={spotDisplay} readOnly className="w-full rounded border border-gray-300 px-3 py-2 text-black"/>
        </div>
      </div>

      <div className="mt-6">
        <label className="mb-1 block text-sm font-medium">β — Beta source</label>
        <div className="flex gap-3">
          <select
            className="w-80 rounded border border-gray-300 px-3 py-2 text-black"
            value={betaSource}
            onChange={(e) => setBetaSource(e.target.value)}
          >
            {BETA_SOURCES.map((s) => (
              <option key={s.value} value={s.value} disabled={s.disabled}>
                {s.label}
              </option>
            ))}
          </select>
          <input
            className="w-40 rounded border border-gray-300 px-3 py-2 text-black"
            value={beta == null ? "" : String(beta)}
            readOnly={betaSource !== "manual"}
            onChange={(e) => {
              if (betaSource === "manual") setBeta(Number(e.target.value));
            }}
            placeholder="Beta"
          />
        </div>
        {betaNote && <div className="mt-2 text-sm text-amber-600">{betaNote}</div>}
      </div>
    </div>
  );
}
