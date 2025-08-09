"use client";

import { useEffect, useMemo, useState } from "react";
import TickerSearch from "./TickerSearch";

function Field({ label, value, disabled = true }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm text-zinc-400">{label}</label>
      <input
        value={value ?? ""}
        readOnly={disabled}
        className="w-full rounded-xl border border-zinc-700/50 bg-transparent px-3 py-2 outline-none"
      />
    </div>
  );
}

export default function CompanyCard({
  value,
  market,
  onConfirm,            // (company) => void
  onHorizonChange,      // (days) => void
  onIvSourceChange,     // (source) => "live" | "hist"
  onIvValueChange,      // (decimal) => void (e.g., 0.30)
}) {
  const [query, setQuery] = useState(value?.symbol ?? "");
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [ccy, setCcy] = useState("");
  const [spot, setSpot] = useState(null);
  const [beta, setBeta] = useState(null);
  const [ivLive, setIvLive] = useState(null);
  const [ivHist, setIvHist] = useState(null);
  const [err, setErr] = useState("");

  // enable confirm if there is either a selection OR a non-empty ticker text
  const canConfirm = !loading && (selected?.symbol || (query ?? "").trim().length > 0);

  useEffect(() => {
    if (value?.symbol) {
      setQuery(value.symbol);
      setCcy(value.currency ?? "");
      setSpot(value.spot ?? null);
      setBeta(value.beta ?? null);
      setIvLive(value.ivLive ?? null);
      setIvHist(value.ivHist ?? null);
    }
  }, [value]);

  async function pull(symbol) {
    const sym = (symbol ?? query ?? "").trim().toUpperCase();
    if (!sym) return;

    setLoading(true);
    setErr("");
    try {
      const r = await fetch(`/api/company?symbol=${encodeURIComponent(sym)}`, {
        cache: "no-store",
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Lookup failed");

      setCcy(j.currency ?? "");
      setSpot(j.spot ?? null);
      setBeta(j.beta ?? null);
      setIvLive(j.ivLive ?? null);
      setIvHist(j.ivHist ?? null);

      // Wire IV to the rest of the app (prefer live, fallback hist)
      const iv = j.ivLive ?? j.ivHist ?? null;
      if (iv != null) {
        onIvSourceChange?.(j.ivLive != null ? "live" : "hist");
        onIvValueChange?.(iv);
      }

      onConfirm?.(j); // push full company payload upstream
      setSelected(null); // clear selection highlight
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  const onChoose = (item) => {
    const sym = item?.symbol ?? item?.ticker ?? "";
    if (sym) {
      setQuery(sym);
      setSelected(item);
      // Auto-fetch immediately on pick (Excel-like)
      pull(sym);
    }
  };

  const capm = useMemo(() => {
    const rf = Number(market?.riskFree ?? 0) / 100; // if supplied as %
    const mrp = Number(market?.mrp ?? 0) / 100;
    const b = Number(beta ?? 0);
    if (!isFinite(rf) || !isFinite(mrp) || !isFinite(b)) return "";
    const res = rf + b * mrp;
    return (res * 100).toFixed(2); // show as %
  }, [market?.riskFree, market?.mrp, beta]);

  return (
    <div className="rounded-2xl border border-zinc-700/50 p-4">
      <div className="text-lg font-semibold mb-3">Company</div>

      {/* Search + Confirm */}
      <div className="flex gap-2 items-start">
        <div className="grow">
          <TickerSearch
            value={query}
            onChange={(t) => {
              setQuery(t);
              setSelected(null);
            }}
            onSelect={onChoose}
            onEnter={(t) => pull(t)}
            placeholder="Ticker or company (e.g., AAPL, RACE, ENEL.MI)"
          />
        </div>
        <button
          onClick={() => pull()}
          disabled={!canConfirm}
          className={`rounded-xl px-4 py-2 text-sm font-medium ${
            canConfirm
              ? "bg-blue-600 hover:bg-blue-500"
              : "bg-zinc-700 text-zinc-400 cursor-not-allowed"
          }`}
        >
          {loading ? "Loading…" : "Confirm"}
        </button>
      </div>

      {err ? (
        <div className="mt-2 text-sm text-red-400">{err}</div>
      ) : null}

      {/* Readouts */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label="Currency" value={ccy} />
        <Field label="S" value={spot != null ? `$${Number(spot).toFixed(2)}` : ""} />
        <Field label="β" value={beta != null ? String(beta) : ""} />
        <Field
          label="σ"
          value={
            ivLive != null
              ? `Live ${Math.round(ivLive * 100)}%`
              : ivHist != null
              ? `Hist ${Math.round(ivHist * 100)}%`
              : ""
          }
        />
        <Field label="CAPM (if Market filled)" value={capm} />
      </div>
    </div>
  );
}
