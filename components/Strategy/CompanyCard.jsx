// components/Strategy/CompanyCard.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* Exchange pretty labels */
const EX_NAMES = {
  NMS: "NASDAQ", NGM: "NASDAQ GM", NCM: "NASDAQ CM",
  NYQ: "NYSE", ASE: "AMEX", PCX: "NYSE Arca",
  MIL: "Milan", LSE: "London", EBS: "Swiss", SWX: "Swiss",
  TOR: "Toronto", SAO: "São Paulo", BUE: "Buenos Aires",
};

/* ---------- helpers ---------- */
function fmtMoney(v, ccy = "") {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  const sign = ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : ccy === "JPY" ? "¥" : "$";
  return sign + n.toFixed(2);
}
function fmtLast(ts) {
  if (!ts) return "";
  const diff = Date.now() - Number(ts);
  if (diff < 45_000) return "Just now";
  try {
    const d = new Date(Number(ts));
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}
function lastFromArray(arr) {
  if (!Array.isArray(arr) || !arr.length) return NaN;
  for (let i = arr.length - 1; i >= 0; i--) {
    const n = Number(arr[i]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return NaN;
}
/** Try many common shapes to extract a spot/last/close price */
function pickSpot(obj) {
  if (!obj || typeof obj !== "object") return NaN;
  const tryKeys = (o) => {
    if (!o || typeof o !== "object") return NaN;
    const keys = [
      "spot","last","lastPrice","price",
      "regularMarketPrice","close","previousClose","prevClose",
    ];
    for (const k of keys) {
      const v = Number(o?.[k]);
      if (Number.isFinite(v) && v > 0) return v;
    }
    return NaN;
  };
  let v = tryKeys(obj);
  if (Number.isFinite(v)) return v;

  const nests = [
    obj.quote, obj.quotes, obj.price, obj.data, obj.meta,
    obj.result?.[0], obj.result, obj.chart?.result?.[0]?.meta,
  ];
  for (const nest of nests) {
    v = tryKeys(nest);
    if (Number.isFinite(v)) return v;
  }
  const arrs = [
    obj?.data?.c, obj?.c, obj?.close,
    obj?.chart?.result?.[0]?.indicators?.quote?.[0]?.close,
    obj?.result?.[0]?.indicators?.quote?.[0]?.close,
  ];
  for (const a of arrs) {
    v = lastFromArray(a);
    if (Number.isFinite(v)) return v;
  }
  return NaN;
}
/** Fallback close/last from chart payloads */
function pickLastClose(j) {
  const arrs = [
    j?.data?.c, j?.c, j?.close,
    j?.chart?.result?.[0]?.indicators?.quote?.[0]?.close,
    j?.result?.[0]?.indicators?.quote?.[0]?.close,
  ];
  for (const a of arrs) {
    const last = lastFromArray(a);
    if (Number.isFinite(last)) return last;
  }
  const metaPx =
    j?.meta?.regularMarketPrice ??
    j?.chart?.result?.[0]?.meta?.regularMarketPrice ??
    j?.regularMarketPrice;
  return Number.isFinite(metaPx) ? metaPx : null;
}

/* ---------- server helpers ---------- */
async function fetchSpotFromChart(sym) {
  try {
    const u = `/api/chart?symbol=${encodeURIComponent(sym)}&range=1d&interval=1m`;
    const r = await fetch(u, { cache: "no-store" });
    const j = await r.json();
    if (!r.ok || j?.ok === false) throw new Error(j?.error || `Chart ${r.status}`);
    const last = pickLastClose(j);
    return Number.isFinite(last) ? last : null;
  } catch {
    return null;
  }
}

export default function CompanyCard({
  value = null,
  onConfirm,
}) {
  /* Selection from NAV search */
  const [picked, setPicked] = useState(
    value?.symbol ? { symbol: value.symbol, name: value.name, exchange: value.exchange } : null
  );
  const selSymbol = useMemo(
    () => (picked?.symbol || "").trim().toUpperCase(),
    [picked]
  );

  /* basics for header */
  const [currency, setCurrency] = useState(value?.currency || "");
  const [spot, setSpot] = useState(value?.spot || null);
  const [lastTs, setLastTs] = useState(null);
  const [exchangeLabel, setExchangeLabel] = useState("");
  const [msg, setMsg] = useState("");

  async function fetchCompany(sym) {
    const r = await fetch(`/api/company?symbol=${encodeURIComponent(sym)}`, { cache: "no-store" });
    const j = await r.json();
    if (!r.ok || j?.ok === false) throw new Error(j?.error || `Company ${r.status}`);

    if (j?.ts) setLastTs(j.ts);

    const ccy =
      j.currency || j.ccy || j?.quote?.currency || j?.price?.currency || j?.meta?.currency || "";
    if (ccy) setCurrency(ccy);

    let px = pickSpot(j);
    if (!Number.isFinite(px) || px <= 0) {
      try {
        const r2 = await fetch(`/api/company/autoFields?symbol=${encodeURIComponent(sym)}`, { cache: "no-store" });
        const j2 = await r2.json();
        if (r2.ok && j2?.ok !== false) {
          const alt = pickSpot(j2);
          if (Number.isFinite(alt) && alt > 0) px = alt;
          const c2 = j2.currency || j2.ccy || j2?.quote?.currency;
          if (c2 && !ccy) setCurrency(c2);
        }
      } catch {}
    }
    if (!Number.isFinite(px) || px <= 0) {
      const c = await fetchSpotFromChart(sym);
      if (Number.isFinite(c) && c > 0) px = c;
      setLastTs(Date.now());
    }

    setSpot(Number.isFinite(px) ? px : null);
    setExchangeLabel(
      (picked?.exchange && (EX_NAMES[picked.exchange] || picked.exchange)) ||
      j.exchange || j.exchangeName || ""
    );

    onConfirm?.({
      symbol: j.symbol || sym,
      name: j.name || j.longName || j.companyName || picked?.name || "",
      exchange: picked?.exchange || j.exchange || null,
      currency: ccy || j.currency || "",
      spot: Number.isFinite(px) ? px : null,
      high52: j.high52 ?? j.fiftyTwoWeekHigh ?? null,
      low52: j.low52 ?? j.fiftyTwoWeekLow ?? null,
      beta: j.beta ?? null,
    });
  }

  async function confirmSymbol(sym) {
    const s = (sym || "").toUpperCase();
    if (!s) return;
    setMsg("");
    try {
      await fetchCompany(s);
    } catch (e) {
      setMsg(String(e?.message || e));
    }
  }

  /* Subscribe to navbar search picks */
  useEffect(() => {
    const onPick = (e) => {
      const it = e?.detail || {};
      const sym = (it.symbol || "").toUpperCase();
      if (!sym) return;
      setPicked({ symbol: sym, name: it.name || "", exchange: it.exchange || it.exchDisp || "" });
      confirmSymbol(sym);
    };
    window.addEventListener("app:ticker-picked", onPick);
    return () => window.removeEventListener("app:ticker-picked", onPick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* If a value was passed initially, confirm it once on mount */
  useEffect(() => {
    if (value?.symbol) {
      const sym = value.symbol.toUpperCase();
      setPicked({ symbol: sym, name: value.name || "", exchange: value.exchange || "" });
      confirmSymbol(sym);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Lightweight live price poll (15s) using chart endpoint only */
  useEffect(() => {
    if (!selSymbol) return;
    let stop = false;
    let id;
    const tick = async () => {
      const px = await fetchSpotFromChart(selSymbol);
      if (!stop && Number.isFinite(px)) {
        setSpot(px);
        setLastTs(Date.now());
        onConfirm?.({
          symbol: selSymbol,
          name: picked?.name || value?.name || "",
          exchange: picked?.exchange || null,
          currency,
          spot: px,
          high52: value?.high52 ?? null,
          low52: value?.low52 ?? null,
          beta: value?.beta ?? null,
        });
      }
      id = setTimeout(tick, 15000);
    };
    tick();
    return () => { stop = true; clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selSymbol]);

  return (
    <section className="company-block">
      {/* Selected status line (single source-of-truth display) */}
      {selSymbol && (
        <div className="company-selected small">
          <span className="muted">Selected:</span> <strong>{selSymbol}</strong>
          {picked?.name ? ` — ${picked.name}` : ""}
          {exchangeLabel ? ` • ${exchangeLabel}` : ""}
          {Number.isFinite(spot) && (
            <>
              {" • "}
              <strong>{fmtMoney(spot, currency)}</strong>
              <span className="muted tiny">{` · Last updated ${fmtLast(lastTs)}`}</span>
            </>
          )}
        </div>
      )}
      {msg && <div className="small" style={{ color: "#ef4444" }}>{msg}</div>}

      <style jsx>{`
        .company-block{ overflow-x: clip; }
        .company-selected{ margin-bottom: 8px; }
        .small{ font-size: 13px; }
        .tiny{ font-size: 11.5px; opacity: .75; }
        .muted{ opacity: .75; }
      `}</style>
    </section>
  );
}
