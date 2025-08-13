// components/Strategy/CompanyCard.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTimeBasis } from "../ui/TimeBasisContext";

/* Exchange pretty labels */
const EX_NAMES = {
  NMS: "NASDAQ", NGM: "NASDAQ GM", NCM: "NASDAQ CM",
  NYQ: "NYSE", ASE: "AMEX", PCX: "NYSE Arca",
  MIL: "Milan", LSE: "London", EBS: "Swiss", SWX: "Swiss",
  TOR: "Toronto", SAO: "São Paulo", BUE: "Buenos Aires",
};

const clamp = (x, a, b) => Math.min(Math.max(Number(x) || 0, a), b);
function fmtMoney(v, ccy = "") {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  const sign = ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : "$";
  return sign + n.toFixed(2);
}
function parsePctInput(str) {
  const v = Number(String(str).replace("%", "").trim());
  return Number.isFinite(v) ? v / 100 : NaN;
}

/* ---------- robust price helpers ---------- */
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

export default function CompanyCard({
  value = null,
  market = null,
  onConfirm,
  onHorizonChange,
  onIvSourceChange,
  onIvValueChange,
}) {
  /* -------- selection comes from the NAV search -------- */
  const [picked, setPicked] = useState(
    value?.symbol ? { symbol: value.symbol, name: value.name, exchange: value.exchange } : null
  );
  const selSymbol = useMemo(
    () => (picked?.symbol || "").trim().toUpperCase(),
    [picked]
  );

  /* -------- basic facts -------- */
  const [currency, setCurrency] = useState(value?.currency || "");
  const [spot, setSpot] = useState(value?.spot || null);
  const [lastTs, setLastTs] = useState(null); // canonical "Last updated"
  const [exchangeLabel, setExchangeLabel] = useState("");

  /* -------- horizon (days) -------- */
  const [days, setDays] = useState(30);

  /* -------- global time basis (365/252) -------- */
  const { basis, setBasis } = useTimeBasis(); // persisted, app-wide

  /* -------- volatility UI state -------- */
  const [volSrc, setVolSrc] = useState("iv");        // 'iv' | 'hist' | 'manual'
  const [sigma, setSigma] = useState(null);          // annualized decimal
  const [volMeta, setVolMeta] = useState(null);
  const [volLoading, setVolLoading] = useState(false);

  /* -------- status -------- */
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  /* Abort/stale guards for volatility fetches */
  const volAbortRef = useRef(null);
  const volSeqRef = useRef(0);
  function cancelVol() {
    try { volAbortRef.current?.abort(); } catch {}
    volAbortRef.current = null;
    setVolLoading(false);
  }

  /* =========================
     API helpers (robust, with fallbacks)
     ========================= */

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

  async function fetchCompany(sym) {
    const r = await fetch(`/api/company?symbol=${encodeURIComponent(sym)}`, { cache: "no-store" });
    const j = await r.json();
    if (!r.ok || j?.ok === false) throw new Error(j?.error || `Company ${r.status}`);

    if (j?.ts) setLastTs(j.ts); // capture server ts if present

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
      setLastTs(Date.now()); // chart tick → use "now"
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

  /**
   * Obtain annualized sigma:
   *  1) /api/volatility (source=live|historical or volSource=…)
   *  2) fallback: /api/company/autoFields
   *  Cancel-safe & stale-guarded.
   */
  async function fetchSigma(sym, uiSource, d) {
    const mapped = uiSource === "hist" ? "historical" : "live";

    // cancel any in-flight call
    cancelVol();
    const ac = new AbortController();
    volAbortRef.current = ac;
    const mySeq = ++volSeqRef.current;
    setVolLoading(true);

    const tryVol = async (paramName) => {
      const u = `/api/volatility?symbol=${encodeURIComponent(sym)}&${paramName}=${encodeURIComponent(mapped)}&days=${encodeURIComponent(d)}`;
      const r = await fetch(u, { cache: "no-store", signal: ac.signal });
      const j = await r.json();
      if (!r.ok || j?.ok === false) throw new Error(j?.error || `Vol ${r.status}`);
      return j;
    };

    try {
      let j;
      try { j = await tryVol("source"); }
      catch { j = await tryVol("volSource"); }

      if (ac.signal.aborted || mySeq !== volSeqRef.current) return;

      setSigma(j?.sigmaAnnual ?? null);
      setVolMeta(j?.meta || null);
      onIvSourceChange?.(mapped === "live" ? "live" : "historical");
      onIvValueChange?.(j?.sigmaAnnual ?? null);
    } catch (e) {
      if (e?.name === "AbortError") return;
      try {
        // fallback: autoFields
        const url = `/api/company/autoFields?symbol=${encodeURIComponent(sym)}&days=${encodeURIComponent(d)}&volSource=${encodeURIComponent(mapped)}`;
        const r = await fetch(url, { cache: "no-store", signal: ac.signal });
        const j = await r.json();
        if (!r.ok || j?.ok === false) throw new Error(j?.error || `AutoFields ${r.status}`);
        if (ac.signal.aborted || mySeq !== volSeqRef.current) return;

        const s = j?.sigmaAnnual ?? j?.sigma ?? null;
        setSigma(s);
        setVolMeta(j?.meta || null);
        onIvSourceChange?.(mapped === "live" ? "live" : "historical");
        onIvValueChange?.(s);
      } catch (e2) {
        if (e2?.name === "AbortError") return;
        throw e2;
      }
    } finally {
      if (mySeq === volSeqRef.current) {
        setVolLoading(false);
        volAbortRef.current = null;
      }
    }
  }

  async function confirmSymbol(sym) {
    const s = (sym || "").toUpperCase();
    if (!s) return;
    setLoading(true); setMsg("");
    try {
      await fetchCompany(s);
      if (volSrc === "manual") {
        cancelVol();
        onIvSourceChange?.("manual");
        onIvValueChange?.(sigma);
      } else {
        await fetchSigma(s, volSrc, days);
      }
    } catch (e) {
      setMsg(String(e?.message || e));
    } finally {
      setLoading(false);
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
  }, [volSrc, days]);

  /* If a value was passed initially, confirm it once on mount */
  useEffect(() => {
    if (value?.symbol) {
      const sym = value.symbol.toUpperCase();
      setPicked({ symbol: sym, name: value.name || "", exchange: value.exchange || "" });
      confirmSymbol(sym);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Re-fetch sigma when source or days change (debounced ~350ms) */
  const daysTimer = useRef(null);
  useEffect(() => {
    if (!selSymbol || volSrc === "manual") {
      cancelVol();
      return;
    }
    clearTimeout(daysTimer.current);
    daysTimer.current = setTimeout(() => {
      fetchSigma(selSymbol, volSrc, days).catch((e) => setMsg(String(e?.message || e)));
    }, 350);
    return () => clearTimeout(daysTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, volSrc, selSymbol]);

  /* Lightweight live price poll (15s) using chart endpoint only */
  useEffect(() => {
    if (!selSymbol) return;
    let stop = false;
    let id;
    const tick = async () => {
      const px = await fetchSpotFromChart(selSymbol);
      if (!stop && Number.isFinite(px)) {
        setSpot(px);
        setLastTs(Date.now()); // chart tick → use "now"
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

  const showVolSkeleton =
    volSrc !== "manual" && (!!selSymbol) && (volLoading || !Number.isFinite(sigma));
  const showHeaderSkeleton =
    !!selSymbol && (loading || !Number.isFinite(spot));
  const showCurrencySkeleton =
    !!selSymbol && (loading || !currency);

  return (
    <section className="company-block">
      {/* Selected line with single source-of-truth price + last updated */}
      {selSymbol && (
        <div className="company-selected small">
          <span className="muted">Selected:</span> <strong>{selSymbol}</strong>
          {picked?.name ? ` — ${picked.name}` : ""}
          {exchangeLabel ? ` • ${exchangeLabel}` : ""}

          {/* Live spot inline (or skeleton while loading) */}
          {" • "}
          {showHeaderSkeleton ? (
            <span className="skl skl-inline" aria-hidden="true" />
          ) : (
            <>
              <strong>{fmtMoney(spot, currency)}</strong>
              <span className="muted tiny">{` · Last updated ${fmtLast(lastTs)}`}</span>
            </>
          )}
        </div>
      )}
      {msg && <div className="small" style={{ color: "#ef4444" }}>{msg}</div>}

      {/* Inline facts/controls */}
      <div className="company-fields">
        {/* Currency */}
        <div className="fg">
          <label>Currency</label>
          <div className="field-wrap">
            <input className={`field ${showCurrencySkeleton ? "is-pending" : ""}`} value={currency || ""} readOnly />
            {showCurrencySkeleton && <span className="skl skl-input" aria-hidden="true" />}
          </div>
        </div>

        {/* ---- Time (basis only) ---- */}
        <div className="fg">
          <label>Time</label>
          <select
            className="field"
            aria-label="Time basis"
            value={basis}
            onChange={(e) => setBasis(Number(e.target.value))}
          >
            <option value={365}>365</option>
            <option value={252}>252</option>
          </select>
        </div>

        {/* Volatility */}
        <div className="fg">
          <label>Volatility</label>
          <div
            className="vol-wrap"
            aria-busy={showVolSkeleton ? "true" : "false"}
          >
            <select
              className="field"
              value={volSrc}
              onChange={(e) => setVolSrc(e.target.value)}
            >
              <option value="iv">Implied Volatility</option>
              <option value="hist">Historical Volatility</option>
              <option value="manual">Manual</option>
            </select>

            {volSrc === "manual" ? (
              <input
                className="field"
                placeholder="0.30 = 30%"
                value={Number.isFinite(sigma) ? (sigma ?? 0) : ""}
                onChange={(e) => {
                  const v = parsePctInput(e.target.value);
                  setSigma(Number.isFinite(v) ? v : null);
                  onIvSourceChange?.("manual");
                  onIvValueChange?.(Number.isFinite(v) ? v : null);
                }}
              />
            ) : (
              <input
                className={`field ${showVolSkeleton ? "is-pending" : ""}`}
                readOnly
                value={Number.isFinite(sigma) ? `${(sigma * 100).toFixed(0)}%` : ""}
              />
            )}

            {/* inline spinner */}
            <span className={`vol-spin ${volLoading ? "is-on" : ""}`} aria-hidden="true" />

            {/* shimmer skeleton over value when loading/not ready */}
            {showVolSkeleton && <span className="skl w-80" aria-hidden="true" />}
          </div>

          <div className="small muted">
            {volSrc === "iv" && volMeta?.expiry
              ? `IV @ ${volMeta.expiry}${volMeta?.fallback ? " · fallback used" : ""}`
              : volSrc === "hist" && volMeta?.pointsUsed
              ? `Hist ${days}d (n=${volMeta.pointsUsed})${volMeta?.fallback ? " · fallback used" : ""}`
              : ""}
          </div>
        </div>
      </div>

      {/* Local minimal styles (keeps Apple-style) */}
      <style jsx>{`
        .tiny{ font-size: 11.5px; opacity: .75; }

        /* Focus rings (subtle, Apple-like) */
        .field:focus-visible{
          outline: 2px solid color-mix(in srgb, var(--text, #0f172a) 28%, transparent);
          outline-offset: 2px;
        }

        .field-wrap{ position: relative; }

        .vol-wrap{ position: relative; }
        .vol-spin{
          position:absolute; right:10px; top:50%; margin-top:-8px;
          width:16px; height:16px; border-radius:50%;
          border:2px solid transparent;
          border-top-color: color-mix(in srgb, var(--text, #0f172a) 60%, var(--card, #fff));
          opacity:0; pointer-events:none;
          animation: vs-rot 0.9s linear infinite;
        }
        .vol-spin.is-on{ opacity:1; }
        @keyframes vs-rot{ to { transform: rotate(360deg); } }

        /* Shimmer skeletons */
        .skl{
          position:absolute;
          border-radius: 8px;
          background: color-mix(in srgb, var(--text, #0f172a) 12%, var(--surface, #f7f9fc));
          overflow:hidden;
        }
        .skl::after{
          content:""; position:absolute; inset:0; transform:translateX(-100%);
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.45), transparent);
          animation: shimmer 1.15s ease-in-out infinite;
        }
        /* inline skeleton used in the Selected line for spot */
        .skl-inline{
          display:inline-block; width:110px; height:14px; transform:translateY(2px);
        }
        /* skeleton overlay inside inputs */
        .skl-input{
          right:10px; left:10px; top:50%; height:12px; transform:translateY(-50%);
        }
        .w-80{ width:120px; }

        @keyframes shimmer{ 100% { transform: translateX(100%); } }

        /* Pending value dims text slightly */
        .field.is-pending{ color: color-mix(in srgb, var(--text, #0f172a) 55%, var(--card, #fff)); }
      `}</style>
    </section>
  );
}
