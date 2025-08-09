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
  MIL: "Milan",
  BUE: "Buenos Aires",
};

export default function CompanyCard({
  value = null,
  onConfirm = () => {},
}) {
  const [picked, setPicked] = useState(null); // { symbol, name, exchange }
  const [typed, setTyped] = useState(value?.symbol || "");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // fields we show
  const [currency, setCurrency] = useState(value?.currency || "");
  const [spot, setSpot] = useState(value?.spot || 0);
  const [beta, setBeta] = useState(null);
  const [betaLoading, setBetaLoading] = useState(false);
  const [betaErr, setBetaErr] = useState("");

  const exchLabel =
    picked?.exchange ? (EX_NAMES[picked.exchange] || picked.exchange) : null;

  async function confirm(symbolMaybe) {
    const sym = (symbolMaybe || picked?.symbol || typed).trim();
    if (!sym) return;
    setLoading(true);
    setErr("");
    try {
      // Pull robust quote (Yahoo quote -> Yahoo chart -> Stooq)
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

      onConfirm({
        symbol: j.symbol,
        name: j.name,
        exchange: picked?.exchange || null,
        currency: j.currency,
        spot: j.spot,
      });

      // Fetch beta (AUTO)
      fetchBeta(j.symbol);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function fetchBeta(sym) {
    if (!sym) return;
    setBetaLoading(true);
    setBetaErr("");
    try {
      const r = await fetch(`/api/beta?symbol=${encodeURIComponent(sym)}&range=1y`, {
        cache: "no-store",
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error || `beta (${r.status})`);
      }
      const j = await r.json();
      setBeta(j?.beta == null ? null : Number(j.beta));
    } catch (e) {
      setBeta(null);
      setBetaErr(String(e.message || e));
    } finally {
      setBetaLoading(false);
    }
  }

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
          <input
            value={currency || ""}
            readOnly
            className="w-full rounded border border-gray-300 px-3 py-2 text-black"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-gray-600">S (Spot)</label>
          <input
            value={
              Number.isFinite(spot)
                ? (currency || "").toUpperCase() === "EUR"
                  ? new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(spot)
                  : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(spot)
                : ""
            }
            readOnly
            className="w-full rounded border border-gray-300 px-3 py-2 text-black"
          />
        </div>

        <div className="col-span-2">
          <label className="mb-1 block text-sm text-gray-600">β — Beta coefficient · AUTO</label>
          <div className="flex items-center gap-2">
            <input
              value={
                beta == null
                  ? ""
                  : `${beta.toFixed(2)}`
              }
              readOnly
              className="w-full rounded border border-gray-300 px-3 py-2 text-black"
            />
            <button
              type="button"
              onClick={() => fetchBeta((picked?.symbol || typed || "").toUpperCase())}
              disabled={betaLoading || !typed}
              className="rounded bg-gray-700 px-3 py-2 text-white disabled:opacity-50"
            >
              {betaLoading ? "…" : "Refresh β"}
            </button>
          </div>
          {betaErr && <div className="mt-1 text-sm text-red-600">{betaErr}</div>}
        </div>
      </div>
    </div>
  );
}
