"use client";
import { useEffect, useMemo, useState } from "react";
import useDebounce from "../../hooks/useDebounce";
import { fmtCur, fmtNum, fmtPct } from "../../utils/format";

/* Helpers for currency & percent inputs */
const curSanitize = (s) => (s ?? "").toString().replace(/[^\d.]/g, "");      // keep digits & dot
const pctSanitize = (s) => (s ?? "").toString().replace(/[^\d.]/g, "");      // keep digits & dot
const pctPattern = /^(\d{0,3})(?:\.(\d{0,2})?)?$/;                            // max 3 digits, 2 decimals
const canPct = (raw) => raw === "" || pctPattern.test(raw);
const stripDot = (raw) => (raw.endsWith(".") ? raw.slice(0, -1) : raw);

export default function CompanyCard({
  value,
  market,                       // { riskFree, mrp }
  onConfirm,
  onHorizonChange,
  onIvSourceChange,
  onIvValueChange
}) {
  /* search & fetch */
  const [query, setQuery] = useState(value?.symbol || "");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(value || null);
  const [details, setDetails] = useState(null);

  /* IV source + manual */
  const [ivSource, setIvSource] = useState("live");
  const [ivManualPct, setIvManualPct] = useState("");

  /* 8-field state (with overrides) */
  const [ccy, setCcy] = useState("");           // Currency
  const [D, setD] = useState("");               // D (empty by default)
  const [S, setS] = useState("");               // Spot (currency formatted string)
  const [sigmaPct, setSigmaPct] = useState(""); // σ (% string, e.g. "34.00")
  const [hi52, setHi52] = useState("");         // 52W High (currency)
  const [lo52, setLo52] = useState("");         // 52W Low (currency)
  const [beta, setBeta] = useState("");         // β (numeric)
  const [days, setDays] = useState(30);         // Days (numeric)
  const [driftPct, setDriftPct] = useState(""); // DRIFT (% string)
  const [driftEdited, setDriftEdited] = useState(false);

  const debounced = useDebounce(query, 300);

  /* Fetch search suggestions */
  useEffect(() => {
    if (!debounced || (selected && debounced === selected.symbol)) { setResults([]); return; }
    setLoading(true);
    fetch(`/api/search?q=${encodeURIComponent(debounced)}`)
      .then(r => r.json()).then(d => setResults(d.results || []))
      .finally(() => setLoading(false));
  }, [debounced, selected]);

  /* Confirm ticker → fetch company details and populate fields */
  const confirm = async (sym) => {
    const symbol = sym || (results[0]?.symbol ?? query.toUpperCase());
    if (!symbol) { alert("Select a company/ticker."); return; }
    const r = await fetch(`/api/company?symbol=${encodeURIComponent(symbol)}`);
    const d = await r.json();
    const next = { symbol, ...d };
    setSelected(next); setDetails(d); setResults([]); setQuery(symbol);

    // populate fields (formatted)
    const currency = d.currency || "USD";
    setCcy(currency);
    setS(fmtCur(d.spot ?? 0, currency));
    setHi52(fmtCur(d.high52 ?? 0, currency));
    setLo52(fmtCur(d.low52 ?? 0, currency));
    setBeta(isFinite(d.beta) ? String(d.beta) : "");
    // Choose IV based on source
    const iv = ivSource === "manual" ? (parseFloat(ivManualPct) / 100) : (ivSource === "live" ? d.ivLive : d.ivHist);
    setSigmaPct(isFinite(iv) ? (iv * 100).toFixed(2) : "");
    setD(""); // empty by default
    setDays((prev) => prev || 30);

    // compute drift (CAPM) if market is present
    if (!driftEdited) {
      const rf = market?.riskFree ?? 0;
      const mrp = market?.mrp ?? 0;
      const b = isFinite(d.beta) ? d.beta : 0;
      const drift = rf + b * mrp;
      setDriftPct((drift * 100).toFixed(2)); // store as % string without %
    }

    onConfirm?.(next);
  };

  /* Keep drift auto-updated if user hasn't edited it */
  useEffect(() => {
    if (!details || driftEdited) return;
    const rf = market?.riskFree ?? 0;
    const mrp = market?.mrp ?? 0;
    const b = isFinite(details?.beta) ? details.beta : parseFloat(beta) || 0;
    const drift = rf + b * mrp;
    setDriftPct((drift * 100).toFixed(2));
  }, [market, details, beta, driftEdited]);

  /* Sync IV source/value upwards; editing σ directly switches to manual */
  useEffect(() => { onIvSourceChange?.(ivSource); }, [ivSource, onIvSourceChange]);
  useEffect(() => {
    const v = ivSource === "manual"
      ? (parseFloat(stripDot(ivManualPct)) / 100)
      : (ivSource === "live" ? details?.ivLive : details?.ivHist);
    onIvValueChange?.(isFinite(v) ? v : undefined);
    setSigmaPct(isFinite(v) ? (v * 100).toFixed(2) : "");
  }, [ivSource, ivManualPct, details, onIvValueChange]);

  /* Handlers for currency inputs: format with symbol on blur, allow digits/dot while typing */
  const handleCurrencyChange = (setter) => (e) => setter(curSanitize(e.target.value));
  const handleCurrencyBlur = (setter, currency) => () => {
    const v = parseFloat(curSanitize(arguments[0]?.target?.value ?? "")); // fallback for safety
    const n = isFinite(v) ? v : null;
    setter(n == null ? "" : fmtCur(n, currency));
  };

  /* Safer blur (without relying on event in closure) */
  const blurFormatCurrency = (raw, setter, currency) => {
    const v = parseFloat(curSanitize(raw));
    setter(isFinite(v) ? fmtCur(v, currency) : "");
  };

  /* Percent input change/blur (two decimals, dot accepted) */
  const onPctChange = (val, setter) => {
    const raw = pctSanitize(val);
    if (canPct(raw)) setter(raw);
  };
  const onPctBlur = (val, setter) => {
    if (val === "") return;
    const n = parseFloat(stripDot(val));
    setter(isFinite(n) ? n.toFixed(2) : "");
  };

  return (
    <section className="card">
      <h3>Company</h3>

      {/* Search and confirm */}
      <label>Company / Ticker</label>
      <div className="row">
        <input
          className="field"
          placeholder="Search by name or ticker…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
        />
        <button className="button" onClick={() => confirm()} disabled={loading}>
          {loading ? "Searching…" : "Confirm"}
        </button>
      </div>

      {results.length > 0 && (
        <div className="card" style={{ marginTop: 8 }}>
          <div className="small">No exact match — pick one:</div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            {results.map(r => (
              <button key={r.symbol} className="button ghost" onClick={() => confirm(r.symbol)}>
                {r.symbol} • {r.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 8-field details (labels left, values right) */}
      <div className="grid" style={{ rowGap: 12, marginTop: 8 }}>
        {/* 1. Currency */}
        <div className="index-row">
          <div className="small" style={{ opacity: .95 }}>Currency</div>
          <input className="field" value={ccy} onChange={(e) => setCcy(e.target.value.toUpperCase())} />
        </div>

        {/* 2. D (empty by default) */}
        <div className="index-row">
          <div className="small" style={{ opacity: .95 }}>D</div>
          <input className="field" placeholder="" value={D} onChange={(e) => setD(e.target.value)} />
        </div>

        {/* 3. S (Spot) */}
        <div className="index-row">
          <div className="small" style={{ opacity: .95 }}>S</div>
          <input
            className="field"
            value={S}
            onChange={handleCurrencyChange(setS)}
            onBlur={() => blurFormatCurrency(S, setS, ccy || "USD")}
            placeholder={fmtCur(0, ccy || "USD")}
          />
        </div>

        {/* 4. σ (Implied Volatility, %) */}
        <div className="index-row">
          <div className="small" style={{ opacity: .95 }}>σ</div>
          <input
            className="field"
            value={sigmaPct}
            inputMode="decimal"
            placeholder="e.g., 30.00"
            onChange={(e) => {
              onPctChange(e.target.value, setSigmaPct);
              setIvSource("manual");
              setIvManualPct(e.target.value);
            }}
            onBlur={(e) => {
              onPctBlur(e.target.value, setSigmaPct);
              setIvSource("manual");
              setIvManualPct(stripDot(e.target.value));
            }}
          />
        </div>

        {/* 5. 52-week Range (High / Low) */}
        <div className="index-row">
          <div className="small" style={{ opacity: .95 }}>52-week Range</div>
          <div className="row" style={{ width: "100%" }}>
            <input
              className="field"
              value={hi52}
              onChange={handleCurrencyChange(setHi52)}
              onBlur={() => blurFormatCurrency(hi52, setHi52, ccy || "USD")}
              placeholder={fmtCur(0, ccy || "USD")}
              style={{ width: "50%" }}
            />
            <input
              className="field"
              value={lo52}
              onChange={handleCurrencyChange(setLo52)}
              onBlur={() => blurFormatCurrency(lo52, setLo52, ccy || "USD")}
              placeholder={fmtCur(0, ccy || "USD")}
              style={{ width: "50%" }}
            />
          </div>
        </div>

        {/* 6. β (Beta) */}
        <div className="index-row">
          <div className="small" style={{ opacity: .95 }}>β</div>
          <input
            className="field"
            inputMode="decimal"
            value={beta}
            onChange={(e) => setBeta(e.target.value.replace(/[^\d.-]/g, ""))}
            onBlur={(e) => {
              const n = parseFloat(e.target.value);
              setBeta(isFinite(n) ? String(n) : "");
            }}
          />
        </div>

        {/* 7. Days */}
        <div className="index-row">
          <div className="small" style={{ opacity: .95 }}>Days</div>
          <input
            className="field"
            type="number"
            min={1}
            step={1}
            value={days}
            onChange={(e) => {
              const v = parseInt(e.target.value || "0", 10);
              setDays(v);
              onHorizonChange?.(v);
            }}
          />
        </div>

        {/* 8. DRIFT (%) */}
        <div className="index-row">
          <div className="small" style={{ opacity: .95 }}>DRIFT</div>
          <input
            className="field"
            value={driftPct}
            inputMode="decimal"
            placeholder="e.g., 21.38"
            onChange={(e) => { onPctChange(e.target.value, setDriftPct); setDriftEdited(true); }}
            onBlur={(e) => { onPctBlur(e.target.value, setDriftPct); setDriftEdited(true); }}
          />
        </div>
      </div>

      {/* IV source controls (optional, stays compact) */}
      <div className="card">
        <div className="small">Implied Volatility Source</div>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <select className="field" style={{ width: 220 }} value={ivSource} onChange={(e) => setIvSource(e.target.value)}>
            <option value="live">Live IV</option>
            <option value="hist">Historical IV</option>
            <option value="manual">Manual</option>
          </select>
          {ivSource === "manual" && (
            <input
              className="field"
              placeholder="e.g., 30.00"
              value={ivManualPct}
              inputMode="decimal"
              onChange={(e) => onPctChange(e.target.value, setIvManualPct)}
              onBlur={(e) => onPctBlur(e.target.value, setIvManualPct)}
              style={{ width: 160 }}
            />
          )}
          {/* mirror displayed σ */}
          <span className="small">σ = {sigmaPct ? `${sigmaPct}%` : "—"}</span>
        </div>
      </div>
    </section>
  );
}
