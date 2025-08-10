// components/Strategy/CompanyHero.jsx
"use client";

import { useMemo } from "react";

const EX_NAMES = {
  NMS: "NASDAQ", NGM: "NASDAQ GM", NCM: "NASDAQ CM",
  NYQ: "NYSE", ASE: "AMEX", PCX: "NYSE Arca",
  MIL: "Milan", LSE: "London", EBS: "Swiss", SWX: "Swiss",
  TOR: "Toronto", SAO: "São Paulo", BUE: "Buenos Aires",
};

function fmt2(v){ return Number.isFinite(v) ? v.toFixed(2) : "—"; }
function sign(v){ return v > 0 ? "+" : v < 0 ? "−" : ""; }
function tzNow(){
  const d = new Date();
  const off = -d.getTimezoneOffset(); // minutes from UTC
  const s = off >= 0 ? "+" : "−";
  const a = Math.abs(off); const h = Math.floor(a/60); const m = a%60;
  const mm = m ? ":"+String(m).padStart(2,"0") : "";
  return `GMT${s}${h}${mm}`;
}

export default function CompanyHero({ company }) {
  const {
    symbol = "",
    name = "",
    currency = "USD",
    exchange,
    spot,
    // Optional extras if your /api/company returns them:
    prevClose,
    change,            // absolute
    changePct,         // %
  } = company || {};

  const exchangeLabel = EX_NAMES[exchange] || exchange || "";
  const price = Number(spot);
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

  const dir = Number.isFinite(chAbs) ? (chAbs > 0 ? "pos" : chAbs < 0 ? "neg" : "flat") : "flat";

  return (
    <div className="company-hero" aria-live="polite">
      <div className="ch-left">
        <div className="avatar-lg" aria-hidden="true">
          <span className="avatar-text">{(name || symbol || "?").slice(0,1)}</span>
        </div>
        <div className="ch-meta">
          <div className="ch-title">{name || symbol}</div>
          <div className="ch-line">
            <span className="pill-badge" title={`${symbol} • ${exchangeLabel}`}>
              {symbol}{exchangeLabel ? ` • ${exchangeLabel}` : ""}
            </span>

            {/* Optional quick‑action placeholders */}
            <div className="ch-actions" aria-hidden="true">
              <button className="icon-sq" type="button">–</button>
              <button className="icon-sq" type="button">♛</button>
              <button className="icon-sq" type="button">≈</button>
            </div>
          </div>
        </div>
      </div>

      <div className="ch-right">
        <div className="ch-price">
          <span className="price">{fmt2(price)}</span>
          <span className="ccy">{currency}</span>
        </div>
        {Number.isFinite(chAbs) && Number.isFinite(chPct) && (
          <div className={`ch-change ${dir}`}>
            {sign(chAbs)}{fmt2(Math.abs(chAbs))}&nbsp;&nbsp;
            {sign(chPct)}{fmt2(Math.abs(chPct))}%
          </div>
        )}
        <div className="ch-sub small">As of {new Date().toLocaleString(undefined, { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" })} {tzNow()}</div>
      </div>
    </div>
  );
}
