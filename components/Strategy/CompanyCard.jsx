// components/Strategy/CompanyCard.jsx
"use client";

import { useState } from "react";
import TickerSearch from "./TickerSearch";

/** Nice exchange labels for the "Selected:" line */
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

/** Fallback currency by exchange, used when the API didn’t send currency */
const EXCHANGE_TO_CCY = {
  NASDAQ: "USD",
  "NASDAQ GM": "USD",
  "NASDAQ CM": "USD",
  NMS: "USD",
  NYSE: "USD",
  NYQ: "USD",
  AMEX: "USD",
  ASE: "USD",
  "NYSE Arca": "USD",
  ARCA: "USD",

  London: "GBP",
  LSE: "GBP",

  Milan: "EUR",
  MIL: "EUR",
  BME: "EUR",
  XETRA: "EUR",
  SWX: "CHF",
  Tokyo: "JPY",
  JPX: "JPY",
  TSE: "JPY",
  Toronto: "CAD",
  TSX: "CAD",
  ASX: "AUD",
};

/** Fallback currency by Yahoo-suffix (when present) */
const SUFFIX_TO_CCY = {
  ".MI": "EUR",
  ".PA": "EUR",
  ".DE": "EUR",
  ".F": "EUR",
  ".BE": "EUR",
  ".AS": "EUR",
  ".BR": "EUR",
  ".L": "GBP",
  ".TO": "CAD",
  ".V": "CAD",
  ".SW": "CHF",
  ".ST": "SEK",
  ".HE": "EUR",
  ".HK": "HKD",
  ".T": "JPY",
  ".KS": "KRW",
  ".KQ": "KRW",
  ".AX": "AUD",
  ".NZ": "NZD",
  ".SA": "BRL",
  ".MX": "MXN",
  ".US": "USD",
};

function ccyFromSymbol(sym) {
  const s = String(sym || "").toUpperCase();
  const m = s.match(/\.[A-Z]+$/);
  return m && SUFFIX_TO_CCY[m[0]] ? SUFFIX_TO_CCY[m[0]] : null;
}

function fmtMoney(v, ccy) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: ccy || "USD",
    }).format(n);
  } catch {
    return n.toFixed(2);
  }
}

export default function CompanyCard({
  value = null,
  market = {},
  onConfirm = () => {},
}) {
  const [typed, setTyped] = useState(value?.symbol || "");
  const [picked, setPicked] = useState(null); // { symbol, name, exchange, ... }
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [currency, setCurrency] = useState(value?.currency || "");
  const [spot, setSpot] = useState(value?.spot || 0);

  async function confirm(symbolMaybe) {
    const sym = (symbolMaybe || picked?.symbol || typed).trim();
    if (!sym) return;
    setLoading(true);
    setErr("");

    try {
      const r = await fetch(`/api/company?symbol=${encodeURIComponent(sym.toUpperCase())}`, { cache: "no-store" });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error || `Request failed (${r.status})`);
      }
      const j = await r.json();

      // Resolve currency: API -> exchange guess -> suffix guess -> USD
      const fromApi = j.currency || "";
      const fromExchange = picked?.exchange && EXCHANGE_TO_CCY[picked.exchange];
      const fromSuffix = ccyFromSymbol(j.symbol);
      const resolvedCcy = fromApi || fromExchange || fromSuffix || "USD";

      setCurrency(resolvedCcy);
      setSpot(Number(j.spot || 0));

      onConfirm({
        symbol: j.symbol,
        name: j.name,
        exchange: picked?.exchange || null,
        currency: resolvedCcy,
        spot: j.spot,
        high52: j.high52 ?? null,
        low52: j.low52 ?? null,
        beta: j.beta ?? null,
        ivLive: j.ivLive ?? null,
        ivHist: j.ivHist ?? null,
        driftHist: j.driftHist ?? null,
        fxToEUR: j.fxToEUR ?? null,
        fxSource: j.fxSource ?? null,
      });
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  const exchLabel = picked?.exchange ? (EX_NAMES[picked.exchange] || picked.exchange) : null;

  return (
    <div className="rounded border border-gray-300 p-4">
      <h2 className="mb-3 text-xl font-semibold">Company / Ticker</h2>

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
          <input
            value={currency || ""}
            readOnly
            className="w-full rounded border border-gray-300 px-3 py-2 text-black"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-gray-600">S (Spot)</label>
          <input
            value={fmtMoney(spot, currency)}
            readOnly
            className="w-full rounded border border-gray-300 px-3 py-2 text-black"
          />
        </div>
      </div>
    </div>
  );
}
