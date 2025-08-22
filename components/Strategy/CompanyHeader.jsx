// components/Strategy/CompanyHeader.jsx
"use client";

import { useMemo } from "react";

const EX_CODES = {
  NMS: "NASDAQ", NGM: "NASDAQ GM", NCM: "NASDAQ CM",
  NYQ: "NYSE", ASE: "AMEX", PCX: "NYSE Arca",
  MIL: "Milan", LSE: "London", EBS: "Swiss", SWX: "Swiss",
  TOR: "Toronto", SAO: "São Paulo", BUE: "Buenos Aires",
};

function normalizeExchangeLabel(co) {
  const cands = [
    co?.primaryExchange,
    co?.fullExchangeName,
    co?.exchangeName,
    co?.exchange,
    co?.exch,
    co?.ex,
    co?.market,
    co?.mic,
  ].map(x => String(x || "").trim()).filter(Boolean);
  if (!cands.length) return "";
  for (const raw of cands) {
    const up = raw.toUpperCase();
    if (EX_CODES[up]) return EX_CODES[up];
  }
  const txt = cands.join(" ").toLowerCase();
  if (/(nasdaq|nasdaqgs|nasdaqgm|nasdaqcm)/.test(txt)) return "NASDAQ";
  if (/nyse\s*arca|arca|pcx/.test(txt)) return "NYSE Arca";
  if (/nyse(?!\s*arca)/.test(txt)) return "NYSE";
  if (/amex|nysemkt/.test(txt)) return "AMEX";
  if (/london|lse/.test(txt)) return "London";
  if (/milan|borsa italiana|mil/.test(txt)) return "Milan";
  if (/six|swiss|ebs|swx/.test(txt)) return "Swiss";
  if (/tsx|toronto/.test(txt)) return "Toronto";
  if (/b3|sao\s*paulo|bovespa|sao/.test(txt)) return "São Paulo";
  if (/buenos\s*aires|byma|bue/.test(txt)) return "Buenos Aires";
  const first = cands[0];
  return first.length > 3 ? first : first.toUpperCase();
}

export default function CompanyHeader({ company, spot, currency }) {
  const displayTitle = useMemo(
    () => company?.longName ?? company?.name ?? company?.shortName ?? company?.companyName ?? "",
    [company]
  );

  const logoUrl = useMemo(() => {
    const n = company?.longName || company?.name || "";
    if (!n) return null;
    const core = n
      .replace(/,?\s+(inc|corp|corporation|co|company|ltd|plc|sa|ag|nv|oyj|ab)$/i, "")
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
    if (!core) return null;
    return `https://logo.clearbit.com/${core}.com`;
  }, [company?.longName, company?.name]);

  const exLabel = useMemo(() => normalizeExchangeLabel(company), [company]);

  const changeAbs = useMemo(() => {
    const prev = Number(company?.prevClose);
    if (Number.isFinite(prev) && prev > 0 && Number.isFinite(spot)) return spot - prev;
    return null;
  }, [spot, company?.prevClose]);

  const changePct = useMemo(() => {
    if (!Number.isFinite(changeAbs) || !Number.isFinite(company?.prevClose) || company.prevClose <= 0) return null;
    return (changeAbs / company.prevClose) * 100;
  }, [changeAbs, company?.prevClose]);

  const closeStr = useMemo(
    () => new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", timeZoneName: "short" }),
    []
  );

  return (
    <section className="hero">
      <div className="hero-id">
        <div className="hero-logo" aria-hidden="true">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt=""
              style={{ width: "100%", height: "100%", borderRadius: "inherit" }}
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          ) : (
            String((displayTitle || company?.symbol || "?")).slice(0, 1)
          )}
        </div>
        <div className="hero-texts">
          <h1 className="hero-name">{displayTitle}</h1>
          <div className="hero-pill" aria-label="Ticker and exchange">
            <span className="tkr">{company.symbol}</span>
            {exLabel && (
              <>
                <span className="dot">•</span>
                <span className="ex">{exLabel}</span>
                <span className="ex-icons">
                  <span className="icon" aria-hidden="true">
                    <svg width="12" height="12" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
                      <path d="M5 12h14" />
                    </svg>
                  </span>
                  <span className="icon" aria-hidden="true">
                    <svg width="12" height="12" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
                      <path d="M7 20l5-5 5 5M7 4h10l-3 5 3 5H7l3-5z" />
                    </svg>
                  </span>
                  <span className="icon" aria-hidden="true">
                    <svg width="12" height="12" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
                      <path d="M3 12h3l3 8 4-16 3 8h5" />
                    </svg>
                  </span>
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="hero-price">
        <div className="p-big">
          {Number.isFinite(spot) ? Number(spot).toFixed(2) : "0.00"}
          <span className="p-ccy"> {currency || "USD"}</span>
        </div>
        {Number.isFinite(changeAbs) && Number.isFinite(changePct) && (
          <div className={`p-change ${changeAbs >= 0 ? "up" : "down"}`}>
            {changeAbs >= 0 ? "+" : ""}
            {changeAbs.toFixed(2)} ({changePct.toFixed(2)}%)
          </div>
        )}
        <div className="p-sub">At close at {closeStr}</div>
      </div>

      <style jsx>{`
        .hero{ padding:20px 0 24px 0; margin-bottom:20px; }
        .hero-id{ display:flex; align-items:center; gap:16px; min-width:0; }
        .hero-logo{
          width:84px; height:84px; border-radius:20px;
          background: radial-gradient(120% 120% at 30% 20%, rgba(255,255,255,.08), rgba(0,0,0,.35));
          border:1px solid var(--border); display:flex; align-items:center; justify-content:center;
          font-weight:700; font-size:36px; overflow:hidden;
        }
        .hero-texts{ display:flex; flex-direction:column; gap:8px; min-width:0; }
        .hero-name{ margin:0; font-size:40px; line-height:1.05; letter-spacing:-.3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .hero-pill{ display:inline-flex; align-items:center; gap:8px; height:auto; padding:0; border:0; background:transparent; font-weight:600; width:fit-content; }
        .hero-pill .dot{ opacity:.6; }
        .ex-icons{ display:inline-flex; gap:4px; margin-left:6px; }
        .icon{ width:18px; height:18px; display:flex; align-items:center; justify-content:center; border-radius:4px; border:1px solid var(--border); }
        .hero-price{ margin-top:16px; }
        .p-big{ font-size:56px; line-height:1; font-weight:800; letter-spacing:-.5px; }
        .p-ccy{ font-size:18px; font-weight:600; margin-left:10px; opacity:.9; }
        .p-change{ margin-top:6px; font-size:20px; font-weight:600; }
        .p-change.up{ color:#16a34a; }
        .p-change.down{ color:#dc2626; }
        .p-sub{ margin-top:6px; font-size:14px; opacity:.75; }
        @media (max-width:1100px){
          .hero-logo{ width:72px; height:72px; border-radius:16px; font-size:32px; }
          .hero-name{ font-size:32px; }
          .p-big{ font-size:40px; }
        }
      `}</style>
    </section>
  );
}

