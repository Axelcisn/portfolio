// components/Strategy/CompanyCard.jsx
"use client";

import { useEffect, useMemo, useState } from "react";
import TickerSearch from "./TickerSearch";

/** Human labels for display */
const EX_NAMES = {
  NMS: "NASDAQ",
  NGM: "NASDAQ GM",
  NCM: "NASDAQ CM",
  NASDAQ: "NASDAQ",
  NYQ: "NYSE",
  NYSE: "NYSE",
  ASE: "AMEX",
  AMEX: "AMEX",
  PCX: "NYSE Arca",
  ARCA: "NYSE Arca",
  LSE: "London",
  MIL: "Milan",
  BME: "Madrid",
  XETRA: "XETRA",
  SWX: "SIX Swiss",
  TSE: "Tokyo",
  JPX: "Tokyo",
  TSX: "Toronto",
  ASX: "ASX",
};

/** Currency fallbacks */
const EXCHANGE_TO_CCY = {
  NASDAQ: "USD", "NASDAQ GM": "USD", "NASDAQ CM": "USD", NMS: "USD",
  NYSE: "USD", NYQ: "USD", AMEX: "USD", ASE: "USD", "NYSE Arca": "USD", ARCA: "USD",
  London: "GBP", LSE: "GBP",
  Milan: "EUR", MIL: "EUR", BME: "EUR", XETRA: "EUR",
  SWX: "CHF",
  Tokyo: "JPY", TSE: "JPY", JPX: "JPY",
  Toronto: "CAD", TSX: "CAD",
  ASX: "AUD",
};
const SUFFIX_TO_CCY = {
  ".MI": "EUR", ".PA": "EUR", ".DE": "EUR", ".F": "EUR", ".BE": "EUR",
  ".AS": "EUR", ".BR": "EUR", ".L": "GBP", ".TO": "CAD", ".V": "CAD",
  ".SW": "CHF", ".ST": "SEK", ".HE": "EUR", ".HK": "HKD", ".T": "JPY",
  ".KS": "KRW", ".KQ": "KRW", ".AX": "AUD", ".NZ": "NZD", ".SA": "BRL",
  ".MX": "MXN", ".US": "USD",
};
function ccyFromSymbol(sym) {
  const s = String(sym || "").toUpperCase();
  const m = s.match(/\.[A-Z]+$/);
  return m && SUFFIX_TO_CCY[m[0]] ? SUFFIX_TO_CCY[m[0]] : null;
}
function fmtPct(x, digits = 2) {
  const n = Number(x);
  if (!Number.isFinite(n)) return "—";
  return (n * 100).toFixed(digits);
}
function fmtMoney(v, ccy) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: ccy || "USD" }).format(n);
  } catch {
    return n.toFixed(2);
  }
}

export default function CompanyCard({
  value = null,
  market = {},                  // { riskFree, mrp }
  onConfirm = () => {},         // bubble up confirmed company
  onHorizonChange = () => {},   // bubble up Days if parent cares
}) {
  // selection & identity
  const [typed, setTyped] = useState(value?.symbol || "");
  const [picked, setPicked] = useState(null); // {symbol, name, exchange, ...}
  const exchLabel = picked?.exchange ? (EX_NAMES[picked.exchange] || picked.exchange) : null;

  // fetched data
  const [currency, setCurrency] = useState(value?.currency || "");
  const [spot, setSpot] = useState(value?.spot || 0);
  const [beta, setBeta] = useState(value?.beta ?? null);
  const [ivLive, setIvLive] = useState(null);
  const [ivHist, setIvHist] = useState(null);

  // UI & calc controls
  const [days, setDays] = useState(30);           // MANUAL
  const [sigmaSrc, setSigmaSrc] = useState("live"); // "live" | "hist"
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // CAPM = rf + beta * mrp
  const capm = useMemo(() => {
    const rf  = Number(market?.riskFree ?? 0);
    const mrp = Number(market?.mrp ?? 0);
    const b   = Number(beta ?? 0);
    if (!Number.isFinite(rf) || !Number.isFinite(mrp) || !Number.isFinite(b)) return null;
    return rf + b * mrp; // decimal
  }, [market?.riskFree, market?.mrp, beta]);

  useEffect(() => { onHorizonChange?.(days); }, [days]); // let parent know if needed

  async function fetchCompany(sym, windowDays) {
    const url = `/api/company?symbol=${encodeURIComponent(sym)}${windowDays ? `&histDays=${windowDays}` : ""}`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j?.error || `Request failed (${r.status})`);
    }
    return r.json();
  }

  async function confirm(symbolMaybe) {
    const sym = (symbolMaybe || picked?.symbol || typed).trim().toUpperCase();
    if (!sym) return;
    setLoading(true);
    setErr("");

    try {
      const j = await fetchCompany(sym, sigmaSrc === "hist" ? days : null);

      const apiCcy = j.currency || "";
      const exCcy  = picked?.exchange && EXCHANGE_TO_CCY[picked.exchange];
      const sufCcy = ccyFromSymbol(j.symbol);
      const resolvedCcy = apiCcy || exCcy || sufCcy || "USD";

      setCurrency(resolvedCcy);
      setSpot(Number(j.spot || 0));
      setBeta(j.beta ?? null);
      setIvLive(j.ivLive ?? null);
      setIvHist(j.ivHist ?? null);

      onConfirm({
        symbol: j.symbol,
        name: j.name,
        exchange: picked?.exchange || null,
        currency: resolvedCcy,
        spot: j.spot,
        beta: j.beta ?? null,
      });
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  // When user switches sigma source or days, refresh hist if needed (and a symbol is known)
  useEffect(() => {
    const sym = (picked?.symbol || typed || "").trim().toUpperCase();
    if (!sym) return;
    if (sigmaSrc === "hist") {
      fetchCompany(sym, days).then(j => {
        setIvHist(j.ivHist ?? null);
      }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sigmaSrc, days]);

  const sigma = useMemo(() => {
    if (sigmaSrc === "hist") return ivHist;
    return ivLive;
  }, [sigmaSrc, ivLive, ivHist]);

  return (
    <div className="rounded border border-gray-300 p-4">
      <h2 className="mb-3 text-xl font-semibold">Company / Ticker</h2>

      <TickerSearch
        value={typed}
        onPick={(item) => { setPicked(item); setTyped(item.symbol || ""); setErr(""); }}
        onEnter={(sym) => { setTyped(sym); confirm(sym); }}
        placeholder="AAPL, TSLA, ENEL.MI…"
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

      {/* Row 1: Currency, Spot */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm text-gray-600">Currency</label>
          <input value={currency || ""} readOnly className="w-full rounded border border-gray-300 px-3 py-2 text-black" />
        </div>
        <div>
          <label className="mb-1 block text-sm text-gray-600">S (Spot)</label>
          <input value={fmtMoney(spot, currency)} readOnly className="w-full rounded border border-gray-300 px-3 py-2 text-black" />
        </div>
      </div>

      {/* Row 2: Sigma source + value */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm text-gray-600">σ — Annualized volatility (%) · AUTO</label>
          <select
            value={sigmaSrc}
            onChange={(e) => setSigmaSrc(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-black"
          >
            <option value="live">Live IV</option>
            <option value="hist">Hist vol (trailing)</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm text-gray-600">&nbsp;</label>
          <input
            value={Number.isFinite(Number(sigma)) ? `${fmtPct(sigma)}%` : ""}
            readOnly
            className="w-full rounded border border-gray-300 px-3 py-2 text-black"
            placeholder="—"
          />
        </div>
      </div>

      {/* Row 3: Days (for hist vol) + Beta */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm text-gray-600">Days — forecast window · MANUAL</label>
          <input
            type="number"
            min={5}
            max={365}
            value={days}
            onChange={(e) => setDays(Math.min(365, Math.max(5, Number(e.target.value) || 0)))}
            className="w-full rounded border border-gray-300 px-3 py-2 text-black"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-gray-600">β — Beta coefficient · AUTO</label>
          <input
            value={beta == null ? "" : String(beta)}
            readOnly
            className="w-full rounded border border-gray-300 px-3 py-2 text-black"
            placeholder="—"
          />
        </div>
      </div>

      {/* Row 4: CAPM */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm text-gray-600">CAPM — Expected drift rate (%) · AUTO</label>
          <input
            value={capm == null ? "" : `${fmtPct(capm)}%`}
            readOnly
            className="w-full rounded border border-gray-300 px-3 py-2 text-black"
            placeholder="—"
          />
        </div>
      </div>
    </div>
  );
}
