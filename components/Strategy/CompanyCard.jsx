// components/Strategy/CompanyCard.jsx
"use client";

import { useState } from "react";
import TickerSearch from "./TickerSearch";

const EX_NAMES = {
  NMS: "NASDAQ",
  NGM: "NASDAQ GM",
  NCM: "NASDAQ CM",
  NYQ: "NYSE",
  ASE: "AMEX",
  PCX: "NYSE Arca",
  LSE: "LSE",
  MIL: "Borsa Italiana",
  BUE: "Buenos Aires",
};

export default function CompanyCard({
  value = null,
  market = {},
  onConfirm = () => {},
  onHorizonChange = () => {},
  onIvSourceChange = () => {},
  onIvValueChange = () => {},
}) {
  const [picked, setPicked] = useState(null); // { symbol, name, exchange, ... }
  const [typed, setTyped] = useState(value?.symbol || "");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [currency, setCurrency] = useState(value?.currency || "");
  const [spot, setSpot] = useState(value?.spot || 0);
  const [beta, setBeta] = useState(value?.beta ?? null);

  async function confirm(symbolMaybe) {
    const sym = (symbolMaybe || picked?.symbol || typed).trim();
    if (!sym) return;
    setLoading(true);
    setErr("");
    try {
      // uppercase for Yahoo; server will handle fallback to Stooq with suffix
      const r = await fetch(`/api/company?symbol=${encodeURIComponent(sym.toUpperCase())}`, {
        cache: "no-store",
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error || `Request failed (${r.status})`);
      }
      const j = await r.json();
      setCurrency(j.currency || "");
      setSpot(Number(j.spot || 0));
      setBeta(j.beta ?? null);

      onConfirm({
        symbol: j.symbol,
        name: j.name,
        exchange: picked?.exchange || null,
        currency: j.currency,
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

  const exchLabel =
    picked?.exchange ? (EX_NAMES[picked.exchange] || picked.exchange) : null;

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
          placeholder="AAPL, MSFT, Tesla…"
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
              {picked.name ? ` – ${picked.name}` : ""}
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
          <label className="mb-1 block text-sm text-gray-600">S</label>
          <input value={`$${Number(spot || 0).toFixed(2)}`} readOnly className="w-full rounded border border-gray-300 px-3 py-2 text-black"/>
        </div>
        <div>
          <label className="mb-1 block text-sm text-gray-600">β</label>
          <input value={beta == null ? "" : String(beta)} readOnly className="w-full rounded border border-gray-300 px-3 py-2 text-black"/>
        </div>
      </div>
    </div>
  );
}
