"use client";
import { useEffect, useMemo, useState } from "react";
import useDebounce from "../../hooks/useDebounce";
import { fmtCur } from "../../utils/format";

/* helpers */
const curSanitize = (s) => (s ?? "").toString().replace(/[^\d.]/g, "");
const pctSanitize = (s) => (s ?? "").toString().replace(/[^\d.]/g, "");
const pctPattern = /^(\d{0,3})(?:\.(\d{0,2})?)?$/;            // allow up to 2 decimals
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

  /* IV */
  const [ivSource, setIvSource] = useState("live");  // live | hist | manual
  const [ivManualPct, setIvManualPct] = useState(""); // string in %

  /* fields (with overrides) */
  const [ccy, setCcy] = useState("");      // 1) Currency
  const [D, setD] = useState("");          // 2) D (free text)
  const [S, setS] = useState("");          // 3) Spot (currency string)
  const [sigmaPct, setSigmaPct] = useState(""); // 4) σ in %
  const [beta, setBeta] = useState("");    // 6) β
  const [days, setDays] = useState(30);    // 7) Days
  const [capmPct, setCapmPct] = useState(""); // 8) CAPM (%)
  const [capmEdited, setCapmEdited] = useState(false);

  const debounced = useDebounce(query, 300);

  /* search suggestions */
  useEffect(() => {
    if (!debounced || (selected && debounced === selected.symbol)) { setResults([]); return; }
    setLoading(true);
    fetch(`/api/search?q=${encodeURIComponent(debounced)}`)
      .then(r => r.json()).then(d => setResults(d.results || []))
      .finally(() => setLoading(false));
  }, [debounced, selected]);

  /* confirm ticker -> fetch details + populate */
  const confirm = async (sym) => {
    const symbol = sym || (results[0]?.symbol ?? query.toUpperCase());
    if (!symbol) { alert("Select a company/ticker."); return; }
    const r = await fetch(`/api/company?symbol=${encodeURIComponent(symbol)}`);
    const d = await r.json();
    const next = { symbol, ...d };
    setSelected(next); setDetails(d); setResults([]); setQuery(symbol);

    const currency = d.currency || "USD";
    setCcy(currency);
    setS(fmtCur(d.spot ?? 0, currency));
    setBeta(Number.isFinite(d.beta) ? String(d.beta) : "");

    // σ from chosen source unless manual already
    const iv = ivSource === "manual" ? (parseFloat(ivManualPct) / 100) : (ivSource === "live" ? d.ivLive : d.ivHist);
    setSigmaPct(Number.isFinite(iv) ? (iv * 100).toFixed(2) : "");

    // CAPM (unless user has edited)
    if (!capmEdited) {
      const rf = market?.riskFree ?? 0;
      const mrp = market?.mrp ?? 0;
      const b = Number.isFinite(d.beta) ? d.beta : parseFloat(beta) || 0;
      setCapmPct(((rf + b * mrp) * 100).toFixed(2));
    }

    onConfirm?.(next);
  };

  /* keep CAPM auto if not edited */
  useEffect(() => {
    if (!details || capmEdited) return;
    const rf = market?.riskFree ?? 0;
    const mrp = market?.mrp ?? 0;
    const b = Number.isFinite(details?.beta) ? details.beta : parseFloat(beta) || 0;
    setCapmPct(((rf + b * mrp) * 100).toFixed(2));
  }, [market, details, beta, capmEdited]);

  /* IV wiring up */
  useEffect(() => { onIvSourceChange?.(ivSource); }, [ivSource, onIvSourceChange]);
  useEffect(() => {
    const v = ivSource === "manual"
      ? (parseFloat(stripDot(ivManualPct)) / 100)
      : (ivSource === "live" ? details?.ivLive : details?.ivHist);
    onIvValueChange?.(Number.isFinite(v) ? v : undefined);
    setSigmaPct(Number.isFinite(v) ? (v * 100).toFixed(2) : "");
  }, [ivSource, ivManualPct, details, onIvValueChange]);

  /* currency input helpers */
  const blurFormatCurrency = (raw, setter, currency) => {
    const v = parseFloat(curSanitize(raw));
    setter(Number.isFinite(v) ? fmtCur(v, currency) : "");
  };

  /* percent input helpers */
  const onPctChange = (val, setter) => {
    const raw = pctSanitize(val);
    if (canPct(raw)) setter(raw);
  };
  const onPctBlur = (val, setter) => {
    if (val === "") return;
    const n = parseFloat(stripDot(val));
    setter(Number.isFinite(n) ? n.toFixed(2) : "");
  };

  return (
    <section className="card">
      <h3>Company</h3>

      {/* search */}
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

      {/* details: label left, value right (aligned) */}
      <div className="grid" style={{ rowGap: 12, marginTop: 8 }}>
        {/* 1. Currency */}
        <div className="index-row">
          <div className="small" style={{ opacity: .95 }}>Currency</div>
          <input className="field" value={ccy} onChange={(e) => setCcy(e.target.value.toUpperCase())} />
        </div>

        {/* 2. D */}
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
            onChange={(e) => setS(curSanitize(e.target.value))}
            onBlur={() => blurFormatCurrency(S, setS, ccy || "USD")}
            placeholder={fmtCur(0, ccy || "USD")}
          />
        </div>

        {/* 4. σ + IV Source inline */}
        <div className="index-row">
          <div className="small" style={{ opacity: .95 }}>σ</div>
          <div className="row" style={{ width: "100%" }}>
            <input
              className="field"
              inputMode="decimal"
              placeholder="30.00"
              value={sigmaPct}
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
              style={{ flex: 1 }}
            />
            <select
              className="field"
              value={ivSource}
              onChange={(e) => setIvSource(e.target.value)}
              style={{ width: 200 }}
              aria-label="Implied Volatility Source"
              title="Implied Volatility Source"
            >
              <option value="live">Live IV</option>
              <option value="hist">Historical IV</option>
              <option value="manual">Manual</option>
            </select>
          </div>
        </div>

        {/* 6. β */}
        <div className="index-row">
          <div className="small" style={{ opacity: .95 }}>β</div>
          <input
            className="field"
            inputMode="decimal"
            value={beta}
            onChange={(e) => setBeta(e.target.value.replace(/[^\d.-]/g, ""))}
            onBlur={(e) => {
              const n = parseFloat(e.target.value);
              setBeta(Number.isFinite(n) ? String(n) : "");
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

        {/* 8. CAPM (%) */}
        <div className="index-row">
          <div className="small" style={{ opacity: .95 }}>CAPM</div>
          <input
            className="field"
            inputMode="decimal"
            placeholder="21.38"
            value={capmPct}
            onChange={(e) => { onPctChange(e.target.value, setCapmPct); setCapmEdited(true); }}
            onBlur={(e) => { onPctBlur(e.target.value, setCapmPct); setCapmEdited(true); }}
          />
        </div>
      </div>
    </section>
  );
}
