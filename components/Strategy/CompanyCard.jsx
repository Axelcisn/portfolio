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

/* ========= New helpers for Beta / Market / CAPM ========= */

/** Pull market stats for ERP & r_f (annual, decimals). */
async function fetchMarketBasics({ index = "^GSPC", currency = "USD", lookback = "2y" }) {
  try {
    const u = `/api/market/stats?index=${encodeURIComponent(index)}&currency=${encodeURIComponent(
      currency
    )}&lookback=${encodeURIComponent(lookback)}&basis=annual`;
    const r = await fetch(u, { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error || `Market ${r.status}`);
    return {
      rAnnual: typeof j?.riskFree?.r === "number" ? j.riskFree.r : null,
      erp: typeof j?.mrp === "number" ? j.mrp : null,
    };
  } catch {
    return { rAnnual: null, erp: null };
  }
}

/** Fetch computed beta with diagnostics; fallback to vendor beta via /api/company. */
async function fetchBetaStats(sym, benchmark = "^GSPC") {
  try {
    const u = `/api/beta/stats?symbol=${encodeURIComponent(sym)}&benchmark=${encodeURIComponent(
      benchmark
    )}&range=5y&interval=1mo`;
    const r = await fetch(u, { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error || `Beta ${r.status}`);
    const b = typeof j?.beta === "number" ? j.beta : null;
    if (b == null) throw new Error("no_beta");
    return b;
  } catch {
    try {
      const rc = await fetch(`/api/company?symbol=${encodeURIComponent(sym)}`, { cache: "no-store" });
      const jc = await rc.json();
      if (!rc.ok) throw new Error(jc?.error || `Company ${rc.status}`);
      const b2 = typeof jc?.beta === "number" ? jc.beta : null;
      return b2;
    } catch {
      return null;
    }
  }
}

/** CAPM drift (annual): \mu = r_f + \beta\cdot \mathrm{ERP} - q */
function capmMu(rAnnual, beta, erp, q = 0) {
  const r = Number(rAnnual) || 0;
  const b = Number(beta) || 0;
  const e = Number(erp) || 0;
  const div = Number(q) || 0;
  return r + b * e - div;
}

/* ======================================================== */

export default function CompanyCard({
  value = null,
  market = null,              // optional: { riskFree, mrp, benchmark }
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
  const [lastTs, setLastTs] = useState(null);
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

  /* -------- new market + beta + capm state -------- */
  const [rf, setRf] = useState(typeof market?.riskFree === "number" ? market.riskFree : null);
  const [erp, setErp] = useState(typeof market?.mrp === "number" ? market.mrp : null);
  const [benchmark, setBenchmark] = useState(market?.benchmark || "^GSPC");
  const [beta, setBeta] = useState(typeof value?.beta === "number" ? value.beta : null);
  const [divPct, setDivPct] = useState("0.00"); // percent string
  const [driftMode, setDriftMode] = useState("CAPM"); // "CAPM" | "RF"

  const qDec = useMemo(() => {
    const n = parsePctInput(divPct);
    return Number.isFinite(n) ? n : 0;
  }, [divPct]);

  const muCapm = useMemo(() => capmMu(rf, beta, erp, qDec), [rf, beta, erp, qDec]);

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

    if (typeof j.beta === "number") setBeta(j.beta);

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

  async function fetchSigma(sym, uiSource, d) {
    const mapped = uiSource === "hist" ? "historical" : "live";

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

      const bench = (market?.benchmark || benchmark || "^GSPC");
      const b = await fetchBetaStats(s, bench);
      if (b != null) setBeta(b);

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

  /* picks from navbar */
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
  }, [volSrc, days, benchmark, market?.benchmark]);

  /* initial */
  useEffect(() => {
    if (value?.symbol) {
      const sym = value.symbol.toUpperCase();
      setPicked({ symbol: sym, name: value.name || "", exchange: value.exchange || "" });
      confirmSymbol(sym);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* beta refresh on benchmark */
  useEffect(() => {
    const bench = market?.benchmark;
    if (!selSymbol || !bench) return;
    fetchBetaStats(selSymbol, bench).then((b) => { if (b != null) setBeta(b); });
  }, [selSymbol, market?.benchmark]);

  /* accept market values; or self-fill once */
  useEffect(() => {
    if (typeof market?.riskFree === "number") setRf(market.riskFree);
    if (typeof market?.mrp === "number") setErp(market.mrp);
    if (market?.benchmark) setBenchmark(market.benchmark);
  }, [market?.riskFree, market?.mrp, market?.benchmark]);

  useEffect(() => {
    if (rf == null || erp == null) {
      fetchMarketBasics({ index: "^GSPC", currency: currency || "USD", lookback: "2y" })
        .then(({ rAnnual, erp }) => {
          if (rAnnual != null) setRf(rAnnual);
          if (erp != null) setErp(erp);
        })
        .catch(() => {});
    }
  }, [rf, erp, currency]);

  /* vol re-fetch (debounced) */
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

  /* live price poll */
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

  const showVolSkeleton =
    volSrc !== "manual" && (!!selSymbol) && (volLoading || !Number.isFinite(sigma));

  return (
    <section className="company-block">
      {/* Selected line */}
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

      {/* Controls */}
      <div className="company-fields">
        <div className="fg fg-xs">
          <label>Currency</label>
          <input className="field" value={currency || ""} readOnly />
        </div>

        <div className="fg fg-xs">
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

        <div className="fg fg-lg">
          <label>Volatility</label>
          <div className="vol-wrap" aria-busy={showVolSkeleton ? "true" : "false"}>
            <select
              className="field"
              value={volSrc}
              onChange={(e) => setVolSrc(e.target.value)}
              title="Volatility source"
            >
              <option value="iv">Imp</option>
              <option value="hist">Hist</option>
              <option value="manual">Manual</option>
            </select>
            {volSrc === "manual" ? (
              <input
                className="field"
                placeholder="0.30"
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

            {/* tiny spinner + shimmer */}
            <span className={`vol-spin ${volLoading ? "is-on" : ""}`} aria-hidden="true" />
            {showVolSkeleton && <span className="skl w-80" aria-hidden="true" />}
          </div>

          <div className="small muted meta-line">
            {volSrc === "iv" && volMeta?.expiry
              ? `IV @ ${volMeta.expiry}${volMeta?.fallback ? " · fallback used" : ""}`
              : volSrc === "hist" && volMeta?.pointsUsed
              ? `Hist ${days}d (n=${volMeta.pointsUsed})${volMeta?.fallback ? " · fallback used" : ""}`
              : ""}
          </div>
        </div>

        <div className="fg fg-xs">
          <label>Beta</label>
          <input className="field" value={Number.isFinite(beta) ? beta.toFixed(2) : ""} readOnly />
        </div>

        <div className="fg fg-sm">
          <label>Dividend (q)</label>
          <input
            className="field"
            placeholder="0.00"
            value={divPct}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^\d.]/g, "");
              if (raw === "" || /^\d{0,3}(\.\d{0,2})?$/.test(raw)) setDivPct(raw);
            }}
            onBlur={() => {
              const v = parsePctInput(divPct);
              setDivPct(Number.isFinite(v) ? (v * 100).toFixed(2) : "0.00");
            }}
          />
        </div>

        <div className="fg fg-sm">
          <label>CAPM μ</label>
          <input
            className="field"
            value={Number.isFinite(muCapm) ? `${(muCapm * 100).toFixed(2)}%` : ""}
            readOnly
          />
        </div>

        <div className="fg fg-sm">
          <label>Drift</label>
          <select
            className="field"
            value={driftMode}
            onChange={(e) => setDriftMode(e.target.value)}
            title="Choose which drift to apply elsewhere"
          >
            <option value="CAPM">CAPM</option>
            <option value="RF">Risk-Free Rate</option>
          </select>
        </div>
      </div>

      <style jsx>{`
        .tiny{ font-size: 11.5px; opacity: .75; }
        .company-block{ overflow-x: clip; }       /* hard-stop any horizontal bleed */
        .company-selected{ margin-bottom: 8px; }

        /* --- GRID --- */
        .company-fields{
          display:grid;
          /* Wide: exact 12 cols so spans stay proportional and never overflow */
          grid-template-columns: repeat(12, minmax(0, 1fr));
          gap: 10px 12px;            /* consistent spacing */
          align-items: end;
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
        }
        /* Spans tuned for balanced proportions on desktop */
        .fg-xs { grid-column: span 1; }  /* tiny: Currency, Time, Beta */
        .fg-sm { grid-column: span 2; }  /* small: q, CAPM μ, Drift */
        .fg-md { grid-column: span 2; }  /* reserved */
        .fg-lg { grid-column: span 3; }  /* Volatility pair */
        /* Below 1500px: tidy two rows using auto-fit, still no overflow */
        @media (max-width: 1500px){
          .company-fields{
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          }
          .fg-xs, .fg-sm, .fg-md, .fg-lg { grid-column: auto; }
        }

        /* --- FIELDS --- */
        .fg{ display:grid; gap:6px; min-width:0; }
        .field{
          height: 42px;                    /* uniform height */
          padding: 8px 12px;               /* compact, consistent interior */
          border-radius: 12px;
          border: 1px solid var(--border, #2a2f3a);
          background: var(--card, #111214);
          color: var(--foreground, #e5e7eb);
          font-size: 14px;
          line-height: 22px;
          width: 100%;
          box-sizing: border-box;
          appearance: none;
          -webkit-appearance: none;
          -moz-appearance: none;
          transition: border-color 140ms ease, outline-color 140ms ease;
          font-variant-numeric: tabular-nums;
        }
        .field:hover{ border-color: var(--ring, #3b3f47); }
        .field:focus-visible{
          outline: 2px solid color-mix(in srgb, var(--text, #e5e7eb) 24%, transparent);
          outline-offset: 2px;
        }

        /* Volatility pair (two equal cells) */
        .vol-wrap{
          position: relative;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          align-items: center;
          min-width: 0;
        }

        /* Spinner + shimmer */
        .vol-spin{
          position:absolute; right:12px; top:50%; margin-top:-8px;
          width:16px; height:16px; border-radius:50%;
          border:2px solid transparent;
          border-top-color: color-mix(in srgb, var(--text, #0f172a) 60%, var(--card, #fff));
          opacity:0; pointer-events:none;
          animation: vs-rot 0.9s linear infinite;
          transition: opacity 120ms ease;
        }
        .vol-spin.is-on{ opacity:1; }
        @keyframes vs-rot{ to { transform: rotate(360deg); } }

        .skl{
          position:absolute; right:44px; top:50%; height:10px; width:96px;
          transform: translateY(-50%);
          border-radius: 8px;
          background: color-mix(in srgb, var(--text, #0f172a) 12%, var(--surface, #f7f9fc));
          overflow:hidden;
        }
        .skl::after{
          content:""; position:absolute; inset:0; transform:translateX(-100%);
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.45), transparent);
          animation: shimmer 1.15s ease-in-out infinite;
        }
        .w-80{ width:120px; }

        .field.is-pending{
          color: color-mix(in srgb, var(--text, #0f172a) 60%, var(--card, #fff));
        }

        .meta-line{ min-height: 18px; } /* keeps row height stable */

        /* Light mode fallback */
        @media (prefers-color-scheme: light) {
          .field{
            border: 1px solid var(--border, #e5e7eb);
            background: var(--card, #ffffff);
            color: var(--foreground, #111827);
          }
          .field:hover{ border-color: var(--ring, #a3a3a3); }
        }
      `}</style>
    </section>
  );
}
