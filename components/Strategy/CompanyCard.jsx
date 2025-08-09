// components/Strategy/CompanyCard.jsx
"use client";

import { useEffect, useState } from "react";
import TickerSearch from "./TickerSearch";

export default function CompanyCard({
  value = null,
  onConfirm = () => {},
}) {
  const [typed, setTyped] = useState(value?.symbol || "");
  const [picked, setPicked] = useState(null);

  const [currency, setCurrency] = useState(value?.currency || "");
  const [spot, setSpot] = useState(Number(value?.spot || 0));

  // ---- Beta (no Yahoo option) -----------------------------------------
  // 'calc' = Calculated (1Y daily vs. index), 'manual' = user input
  const [betaSource, setBetaSource] = useState("calc");
  const [beta, setBeta] = useState("");

  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function confirm(symMaybe) {
    const sym = (symMaybe || picked?.symbol || typed || "").trim();
    if (!sym) return;

    setErr("");
    setLoading(true);
    try {
      const res = await fetch(`/api/company?symbol=${encodeURIComponent(sym)}`, {
        cache: "no-store",
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);

      setCurrency(j.currency || "");
      setSpot(Number(j.spot || 0));

      onConfirm({
        symbol: j.symbol,
        name: j.name,
        currency: j.currency,
        spot: j.spot,
        high52: j.high52 ?? null,
        low52: j.low52 ?? null,
        beta: j.beta ?? null,
      });
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  // Fetch calculated beta when source is 'calc'
  useEffect(() => {
    const sym = picked?.symbol || typed;
    if (betaSource !== "calc" || !sym) return;

    let aborted = false;
    (async () => {
      try {
        setErr("");
        const qs = new URLSearchParams({
          symbol: sym,
          source: "calc",
          // currency helps the API pick the right index; optional
          currency: currency || "",
        }).toString();

        const r = await fetch(`/api/beta?${qs}`, { cache: "no-store" });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        if (!aborted) setBeta(j?.beta ?? "");
      } catch (e) {
        if (!aborted) setErr(String(e?.message || e));
      }
    })();

    return () => {
      aborted = true;
    };
    // include currency so if it changes, calc refires
  }, [betaSource, picked?.symbol, typed, currency]);

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

      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={() => confirm()}
          disabled={loading}
          className="rounded bg-black/80 px-3 py-1.5 text-white disabled:opacity-50"
        >
          {loading ? "Loading…" : "Confirm"}
        </button>

        {picked?.symbol && (
          <span className="text-sm">
            Selected: <strong>{picked.symbol}</strong>
            {picked.name ? ` — ${picked.name}` : ""}
            {picked.exchange ? ` • ${picked.exchange}` : ""}
          </span>
        )}
      </div>

      {err && <div className="mt-2 text-sm text-red-600">{err}</div>}

      {/* Currency + S */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-gray-600">Currency</label>
          <input
            value={currency || ""}
            readOnly
            className="w-full rounded border border-gray-300 px-3 py-2 text-black"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-600">S</label>
          <input
            value={
              Number.isFinite(spot)
                ? (currency === "EUR" ? "€" : currency === "GBP" ? "£" : "$") +
                  spot.toFixed(2)
                : ""
            }
            readOnly
            className="w-full rounded border border-gray-300 px-3 py-2 text-black"
          />
        </div>
      </div>

      {/* Beta */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-gray-600">Beta</label>
          <select
            value={betaSource}
            onChange={(e) => setBetaSource(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-black"
          >
            <option value="calc">Calculated (1Y daily vs. index)</option>
            <option value="manual">Manual</option>
          </select>
        </div>

        <div>
          <label className="block text-sm opacity-0">Beta value</label>
          <input
            placeholder="Beta"
            value={
              betaSource === "calc"
                ? beta === "" ? "" : String(beta)
                : String(beta ?? "")
            }
            onChange={(e) => betaSource === "manual" && setBeta(e.target.value)}
            readOnly={betaSource !== "manual"}
            className="w-full rounded border border-gray-300 px-3 py-2 text-black"
          />
        </div>
      </div>
    </div>
  );
}
