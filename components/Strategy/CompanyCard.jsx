// components/Strategy/CompanyCard.jsx
"use client";

import { useEffect, useState } from "react";
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
  market = {},
  onConfirm = () => {},
  onHorizonChange = () => {},
  onIvSourceChange = () => {},
  onIvValueChange = () => {},
}) {
  const [typed, setTyped] = useState(value?.symbol || "");
  const [picked, setPicked] = useState(null); // {symbol,name,exchange,...}

  const [currency, setCurrency] = useState(value?.currency || "");
  const [spot, setSpot] = useState(value?.spot || 0);

  const [betaSource, setBetaSource] = useState("yahoo"); // 'yahoo' | 'calc'
  const [beta, setBeta] = useState(null);

  const [loading, setLoading] = useState(false);
  const [betaLoading, setBetaLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (value?.symbol) setTyped(value.symbol);
  }, [value?.symbol]);

  async function loadCompany(sym) {
    const r = await fetch(`/api/company?symbol=${encodeURIComponent(sym)}`, {
      cache: "no-store",
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error || `Request failed (${r.status})`);
    setCurrency(j.currency || "");
    setSpot(Number(j.spot || 0));
    onConfirm({
      symbol: j.symbol,
      name: j.name,
      currency: j.currency,
      spot: j.spot,
      beta: j.beta ?? null,
      ivLive: j.ivLive ?? null,
      ivHist: j.ivHist ?? null,
      driftHist: j.driftHist ?? null,
      fxToEUR: j.fxToEUR ?? null,
      fxSource: j.fxSource ?? null,
    });
  }

  async function loadBeta(sym, source) {
    setBetaLoading(true);
    try {
      const r = await fetch(
        `/api/beta?symbol=${encodeURIComponent(sym)}&source=${encodeURIComponent(
          source
        )}`,
        { cache: "no-store" }
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `Request failed (${r.status})`);
      setBeta(j.beta);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBetaLoading(false);
    }
  }

  async function confirm(symMaybe) {
    const sym = (symMaybe || picked?.symbol || typed).trim().toUpperCase();
    if (!sym) return;
    setErr("");
    setLoading(true);
    try {
      await loadCompany(sym);
      await loadBeta(sym, betaSource);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  // When beta source changes, refresh (if we have a symbol)
  useEffect(() => {
    const sym = (picked?.symbol || typed || "").trim();
    if (sym) loadBeta(sym.toUpperCase(), betaSource).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [betaSource]);

  const exchLabel =
    picked?.exchange ? EX_NAMES[picked.exchange] || picked.exchange : null;

  return (
    <div className="rounded border border-gray-300 p-4">
      <h2 className="mb-3 text-2xl font-semibold">Company / Ticker</h2>

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
              currency === "EUR"
                ? `€${Number(spot || 0).toFixed(2)}`
                : `$${Number(spot || 0).toFixed(2)}`
            }
            readOnly
            className="w-full rounded border border-gray-300 px-3 py-2 text-black"
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm text-gray-600">
            β — Beta source
          </label>
          <select
            className="w-full rounded border border-gray-300 px-3 py-2 text-black"
            value={betaSource}
            onChange={(e) => setBetaSource(e.target.value)}
          >
            <option value="yahoo">Yahoo Finance (exact)</option>
            <option value="calc">Calculated (1Y daily vs. index)</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm text-gray-600">Beta</label>
          <input
            value={
              beta == null
                ? ""
                : Number(beta).toFixed(6).replace(/\.?0+$/, "")
            }
            placeholder={betaLoading ? "Loading…" : "Beta"}
            readOnly
            className="w-full rounded border border-gray-300 px-3 py-2 text-black"
          />
        </div>
      </div>
    </div>
  );
}
