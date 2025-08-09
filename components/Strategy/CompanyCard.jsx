// components/Strategy/CompanyCard.jsx
"use client";

import { useEffect, useMemo, useState } from "react";
import TickerSearch from "./TickerSearch";

const EX_NAMES = {
  NMS: "NASDAQ",
  NGM: "NASDAQ GM",
  NCM: "NASDAQ CM",
  NYQ: "NYSE",
  ASE: "AMEX",
  PCX: "NYSE Arca",
  LSE: "London",
  MIL: "Milan",
  BUE: "Buenos Aires",
};

function symbolToCurrency(sym) {
  const s = String(sym || "").toUpperCase();
  if (s.includes(".MI")) return "EUR";
  if (s.endsWith(".L")) return "GBP";
  if (s.endsWith(".PA") || s.endsWith(".DE")) return "EUR";
  return "USD";
}

function fmtMoney(amt, ccy) {
  const v = Number(amt);
  if (!Number.isFinite(v)) return "";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: ccy || "USD",
      maximumFractionDigits: 2,
    }).format(v);
  } catch {
    return `${v.toFixed(2)} ${ccy || ""}`.trim();
  }
}

export default function CompanyCard({
  value = null,
  market = {},
  onConfirm = () => {},
  onHorizonChange = () => {},
  onIvSourceChange = () => {},
  onIvValueChange = () => {},
}) {
  const [picked, setPicked] = useState(null); // from search
  const [typed, setTyped] = useState(value?.symbol || "");

  // company fields
  const [currency, setCurrency] = useState(value?.currency || "");
  const [spot, setSpot] = useState(value?.spot || 0);

  // errors
  const [err, setErr] = useState("");

  // --- Beta ---
  const [betaSource, setBetaSource] = useState("yahoo"); // "yahoo" | "calc" | "manual"
  const [beta, setBeta] = useState(value?.beta ?? "");
  const [betaErr, setBetaErr] = useState("");

  const exchLabel = useMemo(
    () => (picked?.exchange ? EX_NAMES[picked.exchange] || picked.exchange : null),
    [picked]
  );

  async function fetchCompany(symMaybe) {
    const sym = (symMaybe || picked?.symbol || typed).trim();
    if (!sym) return;
    setErr("");
    try {
      const r = await fetch(`/api/company?symbol=${encodeURIComponent(sym)}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `Request failed (${r.status})`);

      setCurrency(j.currency || symbolToCurrency(sym));
      setSpot(Number(j.spot || 0));
      // use Yahoo beta if present; user can override via selector
      setBeta(j.beta ?? "");

      onConfirm({
        symbol: j.symbol,
        name: j.name,
        exchange: picked?.exchange || null,
        currency: j.currency || symbolToCurrency(sym),
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
      setErr(String(e?.message || e));
    }
  }

  async function refreshBeta(sym) {
    const symbol = (sym || picked?.symbol || typed || "").trim();
    if (!symbol) return;
    setBetaErr("");

    if (betaSource === "manual") return; // user edits
    try {
      const src = betaSource === "calc" ? "calc" : "yahoo";
      const r = await fetch(`/api/beta?symbol=${encodeURIComponent(symbol)}&source=${src}`, {
        cache: "no-store",
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `Beta fetch failed (${r.status})`);
      setBeta(j?.beta ?? "");
    } catch (e) {
      setBetaErr(String(e?.message || e));
    }
  }

  // recompute beta when symbol/source changes
  useEffect(() => {
    refreshBeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [betaSource, picked?.symbol]);

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
          fetchCompany(sym);
        }}
        placeholder="AAPL, ENEL.MI, TSLA…"
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => fetchCompany()}
          className="rounded bg-blue-600 px-3 py-2 text-white disabled:opacity-50"
        >
          Confirm
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

      {/* Basic fields */}
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
            value={fmtMoney(spot || 0, currency || symbolToCurrency(typed))}
            readOnly
            className="w-full rounded border border-gray-300 px-3 py-2 text-black"
          />
        </div>
      </div>

      {/* Beta */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm text-gray-600">Beta</label>
          <select
            className="w-full rounded border border-gray-300 px-3 py-2 text-black"
            value={betaSource}
            onChange={(e) => setBetaSource(e.target.value)}
          >
            <option value="yahoo">Yahoo Finance</option>
            <option value="calc">Calculated</option>
            <option value="manual">Manual</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm text-gray-600">&nbsp;</label>
          <input
            value={beta ?? ""}
            onChange={(e) => setBeta(e.target.value)}
            readOnly={betaSource !== "manual"}
            placeholder="Beta"
            className="w-full rounded border border-gray-300 px-3 py-2 text-black"
          />
          {betaErr && <div className="mt-1 text-xs text-red-600">{betaErr}</div>}
        </div>
      </div>
    </div>
  );
}
