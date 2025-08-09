"use client";

import { useEffect, useMemo, useState } from "react";
import TickerSearch from "./TickerSearch";

function fmtMoney(ccy, v) {
  if (v == null || !isFinite(Number(v))) return "";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: ccy || "USD",
      maximumFractionDigits: 2,
    }).format(Number(v));
  } catch {
    return Number(v).toFixed(2);
  }
}

export default function CompanyCard() {
  // UI state
  const [query, setQuery] = useState("");    // input text
  const [symbol, setSymbol] = useState("");  // selected symbol
  const [ccy, setCcy] = useState("");
  const [spotRaw, setSpotRaw] = useState(null);
  const [beta, setBeta] = useState(null);
  const [sigma, setSigma] = useState(30);
  const [days, setDays] = useState(30);
  const [capm, setCapm] = useState(0);

  const spot = useMemo(() => {
    if (spotRaw == null) return "";
    return fmtMoney(ccy, spotRaw);
  }, [spotRaw, ccy]);

  // Read Market inputs (Risk-free %, ERP %) from localStorage if present
  function computeCAPM(nextBeta) {
    const rfPct = Number(localStorage.getItem("market:rfPct") || "0");
    const erpPct = Number(localStorage.getItem("market:erpPct") || "0");
    const b = Number.isFinite(nextBeta) ? nextBeta : Number(beta || 0);
    const v = rfPct + b * erpPct;
    if (Number.isFinite(v)) setCapm(Number(v.toFixed(2)));
  }

  useEffect(() => {
    computeCAPM(beta);
    // Update CAPM whenever Market panel saves new values (storage event)
    const onStorage = (e) => {
      if (e.key === "market:rfPct" || e.key === "market:erpPct") computeCAPM(beta);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beta]);

  async function loadCompany(sym) {
    if (!sym) return;
    try {
      const res = await fetch(`/api/company?symbol=${encodeURIComponent(sym)}`, {
        cache: "no-store",
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Lookup failed");
      setSymbol(j.symbol || sym);
      setQuery(j.symbol || sym);
      setCcy(j.currency || "USD");
      setSpotRaw(j.spot ?? null);
      setBeta(Number.isFinite(j.beta) ? j.beta : null);
      computeCAPM(Number(j.beta));
    } catch (e) {
      console.error(e);
    }
  }

  function handlePick(item) {
    // item: { symbol, name, exch, type }
    const sym = (item?.symbol || "").trim();
    if (!sym) return;
    loadCompany(sym);
  }

  async function handleConfirm() {
    // If the user typed but didn’t pick, try as-is; else fallback to first search match.
    const typed = (query || "").trim();
    if (!typed) return;
    await loadCompany(typed);
  }

  return (
    <div className="rounded-2xl border border-[#2c2c2e] bg-[#0b0b0f] p-5">
      <div className="text-white text-xl font-semibold">Company</div>

      <div className="mt-4">
        <div className="text-sm text-neutral-300 mb-2">Company / Ticker</div>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <TickerSearch
              value={query}
              onChange={setQuery}
              onPick={handlePick}
              placeholder="Search by name or ticker…"
            />
          </div>
          <button
            onClick={handleConfirm}
            className="shrink-0 rounded-xl bg-[#007aff] px-4 py-3 text-white hover:brightness-95 active:brightness-110 focus:outline-none focus:ring-2 focus:ring-[#007aff]"
          >
            Confirm
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Currency */}
        <div>
          <div className="mb-2 text-sm text-neutral-300">Currency</div>
          <input
            value={ccy}
            onChange={(e) => setCcy(e.target.value.toUpperCase())}
            className="w-full rounded-xl bg-[#17171b] border border-[#2c2c2e] px-4 py-3 text-white outline-none focus:ring-2 focus:ring-[#007aff]"
            placeholder="USD"
          />
        </div>

        {/* D (empty / user note) */}
        <div>
          <div className="mb-2 text-sm text-neutral-300">D</div>
          <input
            className="w-full rounded-xl bg-[#17171b] border border-[#2c2c2e] px-4 py-3 text-white outline-none focus:ring-2 focus:ring-[#007aff]"
            placeholder=""
          />
        </div>

        {/* Spot S */}
        <div>
          <div className="mb-2 text-sm text-neutral-300">S</div>
          <input
            value={spot}
            onChange={(e) => setSpotRaw(Number(e.target.value.replace(/[^\d.]/g, "")) || 0)}
            className="w-full rounded-xl bg-[#17171b] border border-[#2c2c2e] px-4 py-3 text-white outline-none focus:ring-2 focus:ring-[#007aff]"
            placeholder="$0.00"
          />
        </div>

        {/* Sigma + source inline (source kept but not wired here) */}
        <div className="sm:col-span-2">
          <div className="mb-2 text-sm text-neutral-300">σ</div>
          <div className="flex gap-3">
            <input
              value={sigma}
              onChange={(e) => setSigma(Number(e.target.value) || 0)}
              className="flex-1 rounded-xl bg-[#17171b] border border-[#2c2c2e] px-4 py-3 text-white outline-none focus:ring-2 focus:ring-[#007aff]"
              placeholder="30.00"
              inputMode="decimal"
            />
            <select
              className="w-40 rounded-xl bg-[#17171b] border border-[#2c2c2e] px-3 py-3 text-white outline-none focus:ring-2 focus:ring-[#007aff]"
              defaultValue="Live IV"
            >
              <option>Live IV</option>
              <option>Hist (1y)</option>
              <option>Manual</option>
            </select>
          </div>
        </div>

        {/* Beta */}
        <div>
          <div className="mb-2 text-sm text-neutral-300">β</div>
          <input
            value={beta ?? ""}
            onChange={(e) => {
              const b = Number(e.target.value);
              setBeta(Number.isFinite(b) ? b : null);
              computeCAPM(b);
            }}
            className="w-full rounded-xl bg-[#17171b] border border-[#2c2c2e] px-4 py-3 text-white outline-none focus:ring-2 focus:ring-[#007aff]"
            placeholder="1.00"
            inputMode="decimal"
          />
        </div>

        {/* Days */}
        <div>
          <div className="mb-2 text-sm text-neutral-300">Days</div>
          <input
            value={days}
            onChange={(e) => setDays(Number(e.target.value) || 0)}
            className="w-full rounded-xl bg-[#17171b] border border-[#2c2c2e] px-4 py-3 text-white outline-none focus:ring-2 focus:ring-[#007aff]"
            placeholder="30"
            inputMode="numeric"
          />
        </div>

        {/* CAPM (computed if Market panel has rf/erp in localStorage) */}
        <div className="sm:col-span-2">
          <div className="mb-2 text-sm text-neutral-300">CAPM</div>
          <input
            value={capm.toFixed(2)}
            onChange={(e) => setCapm(Number(e.target.value) || 0)}
            className="w-full rounded-xl bg-[#17171b] border border-[#2c2c2e] px-4 py-3 text-white outline-none focus:ring-2 focus:ring-[#007aff]"
            placeholder="0.00"
            inputMode="decimal"
          />
        </div>
      </div>
    </div>
  );
}
