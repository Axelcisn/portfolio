// components/Strategy/CompanyCard.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import TickerSearch from "./TickerSearch";

/* ---- helpers & lookups -------------------------------------------------- */
const EX_NAMES = {
  NMS: "NASDAQ",
  NGM: "NASDAQ GM",
  NCM: "NASDAQ CM",
  NYQ: "NYSE",
  ASE: "AMEX",
  PCX: "NYSE Arca",
  MIL: "Milan",
  LSE: "London",
  BUE: "Buenos Aires",
};

function clamp(x, lo, hi) {
  const v = Number(x);
  if (!Number.isFinite(v)) return lo;
  return Math.min(Math.max(v, lo), hi);
}

function fmtMoney(v, ccy = "") {
  const x = Number(v);
  if (!Number.isFinite(x)) return "";
  return (ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : "$") + x.toFixed(2);
}
function fmtPct(x) {
  const v = Number(x);
  if (!Number.isFinite(v)) return "";
  return (v * 100).toFixed(2) + "%";
}
function parsePctInput(str) {
  const v = Number(String(str).replace("%", "").trim());
  return Number.isFinite(v) ? v / 100 : null;
}

/* ---- component ----------------------------------------------------------- */
export default function CompanyCard({
  value = null,
  market = {},
  onConfirm = () => {},
  onHorizonChange = () => {},
  onIvSourceChange = () => {},
  onIvValueChange = () => {},
}) {
  // Search & selection
  const [typed, setTyped] = useState(value?.symbol || "");
  const [picked, setPicked] = useState(null); // { symbol, name, exchange }
  const selSymbol = useMemo(
    () => (picked?.symbol || typed || "").trim(),
    [picked, typed]
  );

  // Company facts
  const [currency, setCurrency] = useState(value?.currency || "");
  const [spot, setSpot] = useState(value?.spot || null);
  const [exchangeLabel, setExchangeLabel] = useState("");

  // Horizon (days)
  const [days, setDays] = useState(30);

  // Volatility
  const [volSrc, setVolSrc] = useState("iv"); // 'iv' | 'hist' | 'manual'
  const [sigma, setSigma] = useState(null);   // decimal
  const [volMeta, setVolMeta] = useState(null);

  // UI state
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  // Debounce recompute when days changes (only for iv/hist)
  const daysTimer = useRef(null);
  useEffect(() => {
    if (!selSymbol || volSrc === "manual") return;
    clearTimeout(daysTimer.current);
    daysTimer.current = setTimeout(() => {
      getVolatility(selSymbol, volSrc, days).catch(() => {});
    }, 500);
    return () => clearTimeout(daysTimer.current);
  }, [days, selSymbol, volSrc]);

  /* -------- server calls -------- */
  async function fetchCompany(sym) {
    const r = await fetch(`/api/company?symbol=${encodeURIComponent(sym)}`, {
      cache: "no-store",
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error || `Company ${r.status}`);
    setCurrency(j.currency || "");
    setSpot(Number(j.spot || 0));
    setExchangeLabel(
      picked?.exchange ? EX_NAMES[picked.exchange] || picked.exchange : ""
    );
    onConfirm({
      symbol: j.symbol,
      name: j.name,
      exchange: picked?.exchange || null,
      currency: j.currency,
      spot: j.spot,
      high52: j.high52 ?? null,
      low52: j.low52 ?? null,
      beta: j.beta ?? null,
    });
  }

  async function getVolatility(sym, source, d) {
    if (!sym) return;
    if (source === "manual") {
      onIvSourceChange?.("manual");
      onIvValueChange?.(sigma);
      return;
    }
    setMsg("");
    try {
      const u = `/api/volatility?symbol=${encodeURIComponent(sym)}&source=${encodeURIComponent(
        source
      )}&days=${encodeURIComponent(d)}`;
      const r = await fetch(u, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `Vol ${r.status}`);
      setSigma(j?.sigmaAnnual ?? null);
      setVolMeta(j?.meta || null);
      onIvSourceChange?.(source);
      onIvValueChange?.(j?.sigmaAnnual ?? null);
    } catch (e) {
      setMsg(String(e?.message || e));
    }
  }

  async function confirm() {
    const sym = selSymbol.toUpperCase();
    if (!sym) return;
    setLoading(true);
    setMsg("");
    try {
      await fetchCompany(sym);
      await getVolatility(sym, volSrc, days);
    } catch (e) {
      setMsg(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  // Recompute when source changes (if symbol already picked)
  useEffect(() => {
    if (!selSymbol) return;
    if (volSrc !== "manual") getVolatility(selSymbol, volSrc, days);
  }, [volSrc]); // eslint-disable-line

  /* -------- render -------- */
  return (
    <div className="rounded border border-gray-300 p-4">
      <h2 className="mb-3 text-xl font-semibold">Company</h2>

      {/* Search + confirm */}
      <div className="mb-2">
        <label className="mb-1 block text-sm font-medium">
          Company / Ticker
        </label>
        <TickerSearch
          value={typed}
          onPick={(it) => {
            setPicked(it);
            setTyped(it.symbol || "");
            setMsg("");
          }}
          onEnter={() => confirm()}
          placeholder="AAPL, ENEL.MI…"
        />
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={confirm}
            disabled={loading}
            className="rounded bg-blue-600 px-3 py-2 text-white disabled:opacity-50"
          >
            {loading ? "Loading…" : "Confirm"}
          </button>
          {selSymbol && (
            <span className="text-sm text-gray-700">
              Selected: <strong>{selSymbol}</strong>
              {picked?.name ? ` — ${picked.name}` : ""}
              {exchangeLabel ? ` • ${exchangeLabel}` : ""}
            </span>
          )}
        </div>
        {msg && <div className="mt-2 text-sm text-red-600">{msg}</div>}
      </div>

      {/* Facts */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm text-gray-600">Currency</label>
          <input
            value={currency || ""}
            readOnly
            className="w-full rounded border border-gray-300 px-3 py-2 text-black"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-gray-600">S</label>
          <input
            value={fmtMoney(spot, currency)}
            readOnly
            className="w-full rounded border border-gray-300 px-3 py-2 text-black"
          />
        </div>
      </div>

      {/* Time (days) */}
      <div className="mt-4">
        <label className="mb-1 block text-sm text-gray-600">Time</label>
        <input
          type="number"
          min={1}
          max={365}
          value={days}
          onChange={(e) => {
            const v = clamp(e.target.value, 1, 365);
            setDays(v);
            onHorizonChange?.(v); // still DAYS
          }}
          className="w-32 rounded border border-gray-300 px-3 py-2 text-black"
        />
      </div>

      {/* Volatility */}
      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between">
          <label className="block text-sm font-medium">Volatility</label>
          <select
            value={volSrc}
            onChange={(e) => setVolSrc(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-black"
          >
            <option value="iv">Live IV</option>
            <option value="hist">Historical</option>
            <option value="manual">Manual</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <input
            placeholder="0.30 = 30%"
            value={
              volSrc === "manual"
                ? (sigma == null ? "" : (sigma * 100).toFixed(2))
                : (sigma == null ? "" : (sigma * 100).toFixed(2))
            }
            onChange={(e) => {
              if (volSrc !== "manual") return;
              const v = parsePctInput(e.target.value);
              setSigma(v);
              onIvValueChange?.(v);
            }}
            readOnly={volSrc !== "manual"}
            className="w-44 rounded border border-gray-300 px-3 py-2 text-black"
          />
          <span className="text-xs text-gray-600">
            {volSrc === "iv" && volMeta?.expiry
              ? `Live IV @ ${volMeta.expiry}${
                  volMeta?.fallback ? " (fallback used)" : ""
                }`
              : volSrc === "hist" && volMeta?.pointsUsed
              ? `Hist ${days}-day (n=${volMeta.pointsUsed})${
                  volMeta?.fallback ? " (fallback used)" : ""
                }`
              : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
