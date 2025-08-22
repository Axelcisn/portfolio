// components/Strategy/CompanyCard.jsx
"use client";

import { useEffect, useMemo, useState } from "react";

/* Exchange pretty labels */
const EX_NAMES = {
  NMS: "NASDAQ", NGM: "NASDAQ GM", NCM: "NASDAQ CM",
  NYQ: "NYSE", ASE: "AMEX", PCX: "NYSE Arca",
  MIL: "Milan", LSE: "London", EBS: "Swiss", SWX: "Swiss",
  TOR: "Toronto", SAO: "São Paulo", BUE: "Buenos Aires",
};

/* ---------- helpers ---------- */
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

/** Extract previous close if available */
function pickPrevClose(obj) {
  if (!obj || typeof obj !== "object") return NaN;
  const keys = [
    "previousClose",
    "prevClose",
    "regularMarketPreviousClose",
    "chartPreviousClose",
  ];
  const tryKeys = (o) => {
    if (!o || typeof o !== "object") return NaN;
    for (const k of keys) {
      const v = Number(o?.[k]);
      if (Number.isFinite(v) && v > 0) return v;
    }
    return NaN;
  };
  let v = tryKeys(obj);
  if (Number.isFinite(v)) return v;
  const nests = [obj.quote, obj.quotes, obj.price, obj.meta, obj.result?.[0]?.meta];
  for (const n of nests) {
    v = tryKeys(n);
    if (Number.isFinite(v)) return v;
  }
  return NaN;
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

async function fetchSpotFromIB(sym) {
  try {
    const u = `/api/ibkr/basic?symbol=${encodeURIComponent(sym)}`;
    const r = await fetch(u, { cache: "no-store" });
    const j = await r.json();
    if (!r.ok || j?.ok === false) return null;
    let px = Number(j.price);
    if (Number.isFinite(px) && px > 0) return px;
    const bid = Number(j?.fields?.["84"]);
    const ask = Number(j?.fields?.["86"]);
    if (Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask > 0) {
      return (bid + ask) / 2;
    }
    return null;
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
  const [exchangeLabel, setExchangeLabel] = useState("");
  const [msg, setMsg] = useState("");
  const latestRef = useRef(value);

  // keep ref in sync with latest parent value
  useEffect(() => {
    latestRef.current = value;
  }, [value]);

  async function fetchCompany(sym) {
    const r = await fetch(`/api/company?symbol=${encodeURIComponent(sym)}`, { cache: "no-store" });
    const j = await r.json();
    if (!r.ok || j?.ok === false) throw new Error(j?.error || `Company ${r.status}`);

    const ccy =
      j.currency || j.ccy || j?.quote?.currency || j?.price?.currency || j?.meta?.currency || "";
    if (ccy) setCurrency(ccy);

    let px = pickSpot(j);
    let prev = pickPrevClose(j);
    if (!Number.isFinite(px) || px <= 0 || !Number.isFinite(prev) || prev <= 0) {
      try {
        const r2 = await fetch(`/api/company/autoFields?symbol=${encodeURIComponent(sym)}`, { cache: "no-store" });
        const j2 = await r2.json();
        if (r2.ok && j2?.ok !== false) {
          if (!Number.isFinite(px) || px <= 0) {
            const alt = pickSpot(j2);
            if (Number.isFinite(alt) && alt > 0) px = alt;
            const c2 = j2.currency || j2.ccy || j2?.quote?.currency;
            if (c2 && !ccy) setCurrency(c2);
          }
          if (!Number.isFinite(prev) || prev <= 0) {
            const altPrev = pickPrevClose(j2);
            if (Number.isFinite(altPrev) && altPrev > 0) prev = altPrev;
          }
        }
      } catch {}
    }
    if (!Number.isFinite(px) || px <= 0) {
      const c = await fetchSpotFromChart(sym);
      if (Number.isFinite(c) && c > 0) px = c;
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
      prevClose: Number.isFinite(prev) ? prev : null,
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

  /* When parent value changes, refetch company */
  useEffect(() => {
    if (value?.symbol) {
      const sym = value.symbol.toUpperCase();
      if (sym !== selSymbol) {
        setPicked({ symbol: sym, name: value.name || "", exchange: value.exchange || "" });
        confirmSymbol(sym);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.symbol]);

  /* Live price poll via IBKR (5s) */
  useEffect(() => {
    if (!selSymbol) return;
    let stop = false;
    let id;
    const tick = async () => {
      const px = await fetchSpotFromIB(selSymbol);
      if (!stop && Number.isFinite(px)) {
        setSpot(px);
        const prev = latestRef.current || {};
        onConfirm?.({
          ...prev,
          symbol: selSymbol,
          name: prev.name || picked?.name || "",
          exchange: prev.exchange || picked?.exchange || null,
          currency: prev.currency || currency,
          spot: px,
        });
      }
      id = setTimeout(tick, 5000);
    };
    tick();
    return () => { stop = true; clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selSymbol]);

  return (
    <section className="company-block">
      {msg && <div className="small" style={{ color: "#ef4444" }}>{msg}</div>}
      <style jsx>{`
        .company-block{ overflow-x: clip; }
        .small{ font-size: 13px; }
      `}</style>
    </section>
  );
}
