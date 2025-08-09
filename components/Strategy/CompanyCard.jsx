// components/Strategy/CompanyCard.jsx
"use client";

import { useState } from "react";
import TickerSearch from "./TickerSearch";

// Display names for exchanges (best-effort)
const EX_NAMES = {
  NMS: "NASDAQ", NASDAQ: "NASDAQ", NGM: "NASDAQ GM", NCM: "NASDAQ CM",
  NYQ: "NYSE", NYSE: "NYSE", ASE: "AMEX", AMEX: "AMEX",
  ARCA: "NYSE Arca", PCX: "NYSE Arca",
  LSE: "London", MIL: "Milan"
};

// Currency fallbacks if Yahoo doesn't provide one
const EXCHANGE_TO_CCY = {
  NASDAQ: "USD", "NASDAQ GM": "USD", "NASDAQ CM": "USD", NMS: "USD",
  NYSE: "USD", NYQ: "USD", AMEX: "USD", ASE: "USD", "NYSE Arca": "USD", ARCA: "USD",
  London: "GBP", LSE: "GBP", Milan: "EUR", MIL: "EUR"
};
const SUFFIX_TO_CCY = { ".US": "USD", ".MI": "EUR", ".L": "GBP", ".PA": "EUR", ".DE": "EUR", ".SW": "CHF", ".TO": "CAD", ".T": "JPY" };
function ccyFromSymbol(sym) {
  const m = String(sym || "").toUpperCase().match(/\.[A-Z]+$/);
  return m?.[0] ? (SUFFIX_TO_CCY[m[0]] || null) : null;
}
function fmtMoney(n, ccy) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "";
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency: ccy || "USD" }).format(v); }
  catch { return v.toFixed(2); }
}

export default function CompanyCard({
  value = null,
  market = {},                  // accepted but unused in this "restored" version
  onConfirm = () => {},
  onHorizonChange = () => {},
  onIvSourceChange = () => {},
  onIvValueChange = () => {},
}) {
  const [typed, setTyped] = useState(value?.symbol || "");
  const [picked, setPicked] = useState(null); // { symbol, name, exchange, ... }
  const [currency, setCurrency] = useState(value?.currency || "");
  const [spot, setSpot] = useState(value?.spot || 0);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const exchLabel = picked?.exchange ? (EX_NAMES[picked.exchange] || picked.exchange) : null;

  async function confirm(symMaybe) {
    const sym = (symMaybe || picked?.symbol || typed).trim();
    if (!sym) return;
    setLoading(true);
    setErr("");
    try {
      const r = await fetch(`/api/company?symbol=${encodeURIComponent(sym)}`, { cache: "no-store" });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error || `Request failed (${r.status})`);
      }
      const j = await r.json();

      // Resolve currency: Yahoo -> exchange -> suffix -> USD
      const apiCcy = j.currency || "";
      const exCcy  = picked?.exchange && EXCHANGE_TO_CCY[picked.exchange];
      const sufCcy = ccyFromSymbol(j.symbol);
      const resolvedCcy = apiCcy || exCcy || sufCcy || "USD";

      setCurrency(resolvedCcy);
      setSpot(Number(j.spot || 0));

      onConfirm({
        symbol: j.symbol,
        name: j.name,
        exchange: picked?.exchange || null,
        currency: resolvedCcy,
        spot: j.spot
      });
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

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
    </div>
  );
}
