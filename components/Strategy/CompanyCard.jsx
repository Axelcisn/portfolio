"use client";

import { useCallback, useMemo, useState } from "react";
import TickerSearch from "./TickerSearch";

function fmtMoney(v, ccy = "USD") {
  if (v == null || Number.isNaN(v)) return "$0.00";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: ccy }).format(v);
  } catch {
    return `$${Number(v).toFixed(2)}`;
  }
}

export default function CompanyCard() {
  const [input, setInput] = useState("");
  const [symbol, setSymbol] = useState("");
  const [ccy, setCcy] = useState("");
  const [spot, setSpot] = useState(null);
  const [beta, setBeta] = useState(null);
  const [sigmaMode, setSigmaMode] = useState("live"); // "live" | "hist"
  const [sigma, setSigma] = useState(30);
  const [days, setDays] = useState(30);
  const [capm, setCapm] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const canConfirm = useMemo(() => !!input.trim(), [input]);

  const fetchCompany = useCallback(async (sym) => {
    if (!sym) return;
    setLoading(true);
    setErr("");
    try {
      const u = `/api/company?symbol=${encodeURIComponent(sym)}`;
      const r = await fetch(u, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || r.statusText);

      setSymbol(j.symbol || sym);
      setCcy(j.currency || "USD");
      setSpot(j.spot ?? null);
      setBeta(j.beta ?? null);

      // Optionally default vol from live/hist if returned
      if (sigmaMode === "live" && j.ivLive != null) setSigma(Number(j.ivLive * 100).toFixed(2));
      if (sigmaMode === "hist" && j.ivHist != null) setSigma(Number(j.ivHist * 100).toFixed(2));

    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [sigmaMode]);

  function onSelect(sym /*, meta */) {
    setInput(sym);
    setSymbol(sym);
    fetchCompany(sym);
  }

  function onConfirm() {
    fetchCompany(input.trim().toUpperCase());
  }

  return (
    <div className="rounded-2xl border border-neutral-800 bg-[#111114] p-4 shadow-sm">
      <div className="mb-3 text-xl font-semibold">Company</div>

      {/* Row: ticker + confirm */}
      <div className="mb-4 flex items-stretch gap-3">
        <div className="grow">
          <TickerSearch
            value={input}
            onChange={setInput}
            onSelect={onSelect}
            placeholder="Type ticker or company…"
          />
        </div>
        <button
          onClick={onConfirm}
          disabled={!canConfirm || loading}
          className="rounded-xl bg-[#007aff] px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? "Loading…" : "Confirm"}
        </button>
      </div>

      {err && <div className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{err}</div>}

      {/* Grid of fields */}
      <div className="grid grid-cols-6 gap-3">
        {/* Currency */}
        <div className="col-span-2">
          <div className="mb-1 text-xs text-neutral-400">Currency</div>
          <input
            value={ccy || ""}
            readOnly
            className="w-full rounded-xl border border-neutral-700 bg-transparent px-3 py-2 text-neutral-200"
          />
        </div>

        {/* D (empty / manual override) */}
        <div className="col-span-2">
          <div className="mb-1 text-xs text-neutral-400">D</div>
          <input
            placeholder=""
            className="w-full rounded-xl border border-neutral-700 bg-transparent px-3 py-2 text-neutral-200"
          />
        </div>

        {/* Spot */}
        <div className="col-span-2">
          <div className="mb-1 text-xs text-neutral-400">S</div>
          <input
            value={fmtMoney(spot, ccy || "USD")}
            readOnly
            className="w-full rounded-xl border border-neutral-700 bg-transparent px-3 py-2 text-neutral-200"
          />
        </div>

        {/* Sigma + source */}
        <div className="col-span-3">
          <div className="mb-1 text-xs text-neutral-400">σ</div>
          <input
            value={String(sigma)}
            onChange={e => setSigma(e.target.value)}
            placeholder="30.00"
            className="w-full rounded-xl border border-neutral-700 bg-transparent px-3 py-2 text-neutral-200"
          />
        </div>
        <div className="col-span-3">
          <div className="mb-1 text-xs text-neutral-400 invisible">source</div>
          <select
            value={sigmaMode}
            onChange={e => setSigmaMode(e.target.value)}
            className="w-full rounded-xl border border-neutral-700 bg-transparent px-3 py-2 text-neutral-200"
          >
            <option value="live">Live IV</option>
            <option value="hist">Historical</option>
          </select>
        </div>

        {/* Beta */}
        <div className="col-span-2">
          <div className="mb-1 text-xs text-neutral-400">β</div>
          <input
            value={beta ?? ""}
            onChange={e => setBeta(e.target.value)}
            className="w-full rounded-xl border border-neutral-700 bg-transparent px-3 py-2 text-neutral-200"
          />
        </div>

        {/* Days */}
        <div className="col-span-2">
          <div className="mb-1 text-xs text-neutral-400">Days</div>
          <input
            value={days}
            onChange={e => setDays(e.target.value)}
            className="w-full rounded-xl border border-neutral-700 bg-transparent px-3 py-2 text-neutral-200"
          />
        </div>

        {/* CAPM (computed elsewhere; placeholder here) */}
        <div className="col-span-2">
          <div className="mb-1 text-xs text-neutral-400">CAPM</div>
          <input
            value={Number(capm).toFixed(2)}
            onChange={e => setCapm(e.target.value)}
            className="w-full rounded-xl border border-neutral-700 bg-transparent px-3 py-2 text-neutral-200"
          />
        </div>
      </div>
    </div>
  );
}
