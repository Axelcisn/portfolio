// components/Strategy/CompanyHero.jsx
"use client";

import { useMemo } from "react";

/* Exchange pretty labels */
const EX_NAMES = {
  NMS: "NASDAQ", NGM: "NASDAQ GM", NCM: "NASDAQ CM",
  NYQ: "NYSE", ASE: "AMEX", PCX: "NYSE Arca",
  MIL: "Milan", LSE: "London", EBS: "Swiss", SWX: "Swiss",
  TOR: "Toronto", SAO: "São Paulo", BUE: "Buenos Aires",
};

/* Clean corporate suffixes for the display name (Apple → Apple) */
function cleanName(raw = "") {
  let s = String(raw).trim();
  if (!s) return "";
  const rx =
    /(,?\s+(incorporated|inc\.?|corp\.?|corporation|company|co\.?|ltd\.?|limited|plc|s\.a\.|sa|s\.p\.a\.|spa|n\.v\.|nv|ag|se|oyj|ab|holdings?))$/i;
  let prev;
  do { prev = s; s = s.replace(rx, "").trim(); } while (s !== prev);
  return s;
}

function formatParts(n) {
  if (!Number.isFinite(n)) return { int: "—", dec: "" };
  const parts = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).formatToParts(n);
  let int = "", dec = "";
  for (const p of parts) {
    if (p.type === "integer" || p.type === "group") int += p.value;
    else if (p.type === "decimal" || p.type === "fraction") dec += p.value;
  }
  return { int, dec };
}
const pctStr = (v) =>
  Number.isFinite(v)
    ? `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}%`
    : null;
const absStr = (v) =>
  Number.isFinite(v)
    ? `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}`
    : null;

function tzNow() {
  const d = new Date();
  const off = -d.getTimezoneOffset();
  const s = off >= 0 ? "+" : "−";
  const a = Math.abs(off); const h = Math.floor(a / 60); const m = a % 60;
  return `GMT${s}${String(h).padStart(2, "0")}${m ? ":" + String(m).padStart(2, "0") : ""}`;
}

export default function CompanyHero({ company }) {
  const {
    symbol = "",
    name = "",
    exchange,
    currency = "USD",
    spot,
    prevClose,
    change,
    changePct,
    marketSession,     // "At close" | "Pre‑market" | "After hours" (optional)
    logoUrl,           // optional
  } = company || {};

  const displayName = cleanName(name || symbol);
  const exchangeLabel = EX_NAMES[exchange] || exchange || "";
  const price = Number(spot);

  // derive move if missing
  const chAbs = useMemo(() => {
    if (Number.isFinite(change)) return change;
    if (Number.isFinite(prevClose) && Number.isFinite(price)) return price - prevClose;
    return null;
  }, [change, prevClose, price]);
  const chPct = useMemo(() => {
    if (Number.isFinite(changePct)) return changePct;
    if (Number.isFinite(prevClose) && prevClose > 0 && Number.isFinite(price)) {
      return ((price - prevClose) / prevClose) * 100;
    }
    return null;
  }, [changePct, prevClose, price]);

  const { int: intPart, dec: decPart } = formatParts(price);
  const dir = Number.isFinite(chAbs) ? (chAbs > 0 ? "pos" : chAbs < 0 ? "neg" : "flat") : "flat";
  const session = marketSession || "At close";

  // For screen readers
  const srLine =
    Number.isFinite(price) && Number.isFinite(chPct)
      ? `Price, ${price.toFixed(2)} ${currency}, ${chPct >= 0 ? "up" : "down"} ${Math.abs(chPct).toFixed(2)} percent`
      : `Price, ${Number.isFinite(price) ? price.toFixed(2) : "unknown"} ${currency}`;

  return (
    <div className="company-hero" aria-live="polite">
      {/* Logo top‑left */}
      <div className="ch-avatar" aria-hidden="true">
        {logoUrl ? (
          <img src={logoUrl} alt="" className="avatar-img" />
        ) : (
          <span className="avatar-mono">{displayName.slice(0, 1)}</span>
        )}
      </div>

      {/* Content to the right of the logo */}
      <div className="ch-content">
        {/* Full company name (no suffixes) */}
        <h1 className="ch-name" title={displayName}>{displayName}</h1>

        {/* TICKER • EXCHANGE inside a pill */}
        <div className="id-pill" title={`${symbol}${exchangeLabel ? " • " + exchangeLabel : ""}`}>
          <span className="id-symbol">{symbol}</span>
          {exchangeLabel && <span className="id-dot">•</span>}
          {exchangeLabel && <span className="id-exch">{exchangeLabel}</span>}
        </div>
      </div>

      {/* Price row spans across and is LEFT‑aligned to the logo edge */}
      <div className="price-stack" aria-label={srLine}>
        <div className="price-row">
          <span className="price-int">{intPart}</span>
          {decPart && <span className="price-dec">{decPart}</span>}
          <span className="price-ccy">{currency}</span>
          {Number.isFinite(chAbs) && Number.isFinite(chPct) && (
            <span className={`price-change ${dir}`}>
              {absStr(chAbs)}&nbsp;&nbsp;{pctStr(chPct)}
            </span>
          )}
        </div>
        {/* MARKET_STATUS • DATE, TIME TZ */}
        <div className="ch-status small">
          {session} •{" "}
          {new Date().toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          {tzNow()}
        </div>
      </div>
    </div>
  );
}
