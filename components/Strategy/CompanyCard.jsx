// components/Strategy/CompanyCard.jsx
"use client";

import { useState } from "react";
import TickerSearch from "./TickerSearch";

export default function CompanyCard({
  value = null,
  market = {},
  onConfirm = () => {},
  // These are accepted so Strategy/page.jsx doesn’t break,
  // but we’re not using them on this step.
  onHorizonChange = () => {},
  onIvSourceChange = () => {},
  onIvValueChange = () => {},
}) {
  const [typed, setTyped] = useState(value?.symbol || "");
  const [picked, setPicked] = useState(null); // { symbol, name, exchange, ... }
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // what we show in the mini fields
  const [currency, setCurrency] = useState(value?.currency || "");
  const [spot, setSpot] = useState(value?.spot ?? null);

  async function confirm(symbolMaybe) {
    const sym = (symbolMaybe || picked?.symbol || typed || "").trim();
    if (!sym) return;
    setLoading(true);
    setErr("");

    try {
      const r = await fetch(`/api/company?symbol=${encodeURIComponent(sym)}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `Request failed (${r.status})`);

      setCurrency(j.currency || "");
      setSpot(Number.isFinite(j.spot) ? j.spot : null);

      onConfirm({
        symbol: j.symbol,
        name: j.name,
        currency: j.currency,
        spot: j.spot,
        beta: j.beta ?? null,
        high52: j.high52 ?? null,
        low52: j.low52 ?? null,
        ivLive: j.ivLive ?? null,
        ivHist: j.ivHist ?? null,
        driftHist: j.driftHist ?? null,
        fxToEUR: j.fxToEUR ?? null,
        fxSource: j.fxSource ?? null,
      });
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
      <h2 className="mb-4 text-2xl font-semibold text-black">Company / Ticker</h2>

      <div className="mb-3">
        <TickerSearch
          value={typed}
          onPick={(it) => { setPicked(it); setTyped(it.symbol || ""); setErr(""); }}
          onEnter={(sym) => confirm(sym)}
          placeholder="AAPL, MSFT, ENEL.MI…"
        />
        <div className="mt-3">
          <button
            type="button"
            onClick={() => confirm()}
            disabled={loading}
            className="rounded bg-gray-900 px-3 py-2 text-white disabled:opacity-50"
          >
            {loading ? "Loading…" : "Confirm"}
          </button>
          {picked?.symbol && (
            <span className="ml-3 text-sm text-gray-700">
              Selected: <strong>{picked.symbol}</strong>
              {picked.name ? ` — ${picked.name}` : ""}
              {picked.exchDisp ? ` • ${picked.exchDisp}` : ""}
            </span>
          )}
        </div>
        {err && <div className="mt-2 text-sm text-red-600">{err}</div>}
      </div>

      {/* Only what you asked for now: Currency + Spot */}
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm text-gray-600">Currency</label>
          <input
            className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-black"
            readOnly
            value={currency || ""}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-gray-600">S (Spot)</label>
          <input
            className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-black"
            readOnly
            value={
              spot == null
                ? ""
                : new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD" }).format(spot)
            }
          />
        </div>
      </div>
    </div>
  );
}
