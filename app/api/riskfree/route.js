// app/api/riskfree/route.js
// Runtime: Node.js (Vercel). Multi-CCY risk-free API with robust fallbacks, shared cache,
// and providers: USD (^IRX), EUR (€STR via ECB SDMX), GBP (SONIA via BoE CSV),
// JPY (TONA via BoJ HTML scrape, best-effort), CHF (SARON via SNB CSV, best-effort),
// CAD (BoC Valet 3M T-bill).
import { NextResponse } from 'next/server';
import { mget, mset, mkey } from '../../../lib/server/mcache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────
// Formulas (LaTeX):
// • Continuous from annual: r_{\text{cont}} = \ln(1 + r_{\text{annual}})
// • Annual from continuous: r_{\text{annual}} = e^{r_{\text{cont}}} - 1
// All rates are decimals per year.
// ─────────────────────────────────────────────────────────────

const TTL_MS = 60 * 1000; // micro-cache TTL
const SUPPORTED = new Set(['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD']);

// Conservative fallbacks (decimal/year) used only if providers fail.
const FALLBACKS = {
  USD: 0.0300,
  EUR: 0.0200,
  GBP: 0.0300,
  JPY: 0.0010,
  CHF: 0.0050,
  CAD: 0.0300,
};

// Keep a "last good" snapshot per CCY so fallbacks can surface previous valid data.
const LAST_GOOD = new Map();

/** Basis transforms */
function toCont(rAnnual) { return Math.log(1 + Number(rAnnual)); }
function toAnnual(rCont) { return Math.exp(Number(rCont)) - 1; } // reserved

// ───────────────────────── Providers ─────────────────────────

// USD: 13-week T-Bill (^IRX) via Yahoo Finance (percent → decimal/year)
async function fetchUSDFromYahooIRX() {
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/%5EIRX?range=1mo&interval=1d';
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Yahoo IRX HTTP ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const closes = result?.indicators?.quote?.[0]?.close || [];
  let i = closes.length - 1;
  while (i >= 0 && (closes[i] === null || typeof closes[i] !== 'number')) i -= 1;
  if (i < 0) throw new Error('Yahoo IRX: no close values');
  const pct = closes[i];
  const rAnnual = Number(pct) / 100;
  const asOf = new Date((timestamps?.[i] || Date.now() / 1000) * 1000).toISOString();
  return { value: rAnnual, asOf, source: 'Yahoo ^IRX (13W T-Bill)', basis: 'annual' };
}

// EUR: €STR via ECB SDMX JSON (percent → decimal/year)
async function fetchEURFromECB() {
  const url = 'https://sdw-wsrest.ecb.europa.eu/service/data/ESTR/D?lastNObservations=1';
  const res = await fetch(url, {
    cache: 'no-store',
    headers: { Accept: 'application/vnd.sdmx.data+json;version=1.0' },
  });
  if (!res.ok) throw new Error(`ECB €STR HTTP ${res.status}`);
  const json = await res.json();
  const series = json?.dataSets?.[0]?.series;
  const obsDim = json?.structure?.dimensions?.observation?.[0]?.values;
  if (!series || !obsDim) throw new Error('ECB €STR: unexpected SDMX structure');

  let lastValue = null;
  let lastIdx = null;
  for (const key in series) {
    const observations = series[key]?.observations;
    if (!observations) continue;
    for (const k in observations) {
      const idx = Number(k);
      if (!Number.isFinite(idx)) continue;
      if (lastIdx === null || idx > lastIdx) {
        lastIdx = idx;
        const arr = observations[k];
        const v = Array.isArray(arr) ? arr[0] : arr;
        if (typeof v === 'number') lastValue = v;
      }
    }
    break; // first series is enough
  }
  if (lastValue == null || lastIdx == null) throw new Error('ECB €STR: no observations');
  const asOf = obsDim?.[lastIdx]?.id || new Date().toISOString();
  const rAnnual = lastValue > 1 ? lastValue / 100 : lastValue;
  return { value: rAnnual, asOf: new Date(asOf).toISOString(), source: 'ECB €STR (SDMX)', basis: 'annual' };
}

// GBP: SONIA via Bank of England CSV (percent → decimal/year)
async function fetchGBPFromBoE() {
  // BoE IADB CSV export for SONIA (series code "IUDSOIA")
  const url = 'https://www.bankofengland.co.uk/boeapps/iadb/fromshowcolumns.asp?csv.x=yes&SeriesCodes=IUDSOIA&UsingCodes=Y&VPD=Y';
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`BoE SONIA HTTP ${res.status}`);
  const text = await res.text();
  const lines = text.trim().split(/\r?\n/);

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line || /^Source:/i.test(line)) continue;
    const parts = line.split(',');
    if (parts.length < 2) continue;
    const valRaw = parts[parts.length - 1].trim();
    const val = Number(valRaw);
    if (Number.isFinite(val)) {
      const dateStr = parts[0].trim();
      const asOfIso = new Date(dateStr).toISOString();
      const rAnnual = val > 1 ? val / 100 : val;
      return { value: rAnnual, asOf: asOfIso, source: 'Bank of England SONIA (CSV)', basis: 'annual' };
    }
  }
  throw new Error('BoE SONIA: no numeric rows');
}

// JPY: TONA via BoJ public page (best-effort HTML scrape; percent → decimal/year)
async function fetchJPYFromBoJ() {
  const url = 'https://www3.boj.or.jp/market/en/menu_tona.htm';
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`BoJ TONA HTTP ${res.status}`);
  const html = await res.text();
  // Find last percentage number in the page (e.g., "0.072 %")
  const matches = Array.from(html.matchAll(/([0-9]+(?:\.[0-9]+)?)\s*%/g));
  if (!matches || matches.length === 0) throw new Error('BoJ TONA: no % pattern found');
  const lastNum = Number(matches[matches.length - 1][1]);
  if (!Number.isFinite(lastNum)) throw new Error('BoJ TONA: invalid number');
  const rAnnual = lastNum / 100;
  const asOf = new Date().toISOString();
  return { value: rAnnual, asOf, source: 'Bank of Japan TONA (HTML, best-effort)', basis: 'annual' };
}

// CHF: SARON via SNB data portal (best-effort CSV; percent → decimal/year)
async function fetchCHFFromSNB() {
  // Attempt compact CSV; if structure changes, fallback layer will engage.
  const url = 'https://data.snb.ch/api/cube/saron/compact?downloadFileType=csv&lang=en';
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`SNB SARON HTTP ${res.status}`);
  const text = await res.text();
  const lines = text.trim().split(/\r?\n/);
  // Heuristic: find last line with 2+ comma-separated fields and numeric last column
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line || /^#/.test(line)) continue;
    const parts = line.split(',');
    if (parts.length < 2) continue;
    const valRaw = parts[parts.length - 1].trim();
    const val = Number(valRaw);
    if (Number.isFinite(val)) {
      const dateStr = parts[0].trim();
      const asOfIso = new Date(dateStr).toISOString();
      const rAnnual = val > 1 ? val / 100 : val;
      return { value: rAnnual, asOf: asOfIso, source: 'SNB SARON (CSV, best-effort)', basis: 'annual' };
    }
  }
  throw new Error('SNB SARON: no numeric rows');
}

// CAD: 3M T-bill via Bank of Canada Valet (percent → decimal/year)
async function fetchCADFromBoCValet() {
  const url = 'https://www.bankofcanada.ca/valet/observations/TB.CDN.90D.MID/json?recent=1';
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`BoC Valet HTTP ${res.status}`);
  const json = await res.json();
  const obs = json?.observations;
  if (!Array.isArray(obs) || obs.length === 0) throw new Error('BoC Valet: no observations');
  const last = obs[obs.length - 1];
  const date = last?.d || new Date().toISOString();
  const node = last?.['TB.CDN.90D.MID'];
  const v = node && (typeof node.v === 'string' || typeof node.v === 'number') ? Number(node.v) : NaN;
  if (!Number.isFinite(v)) throw new Error('BoC Valet: invalid value');
  const rAnnual = v / 100;
  const asOf = new Date(date).toISOString();
  return { value: rAnnual, asOf, source: 'Bank of Canada Valet (TB.CDN.90D.MID)', basis: 'annual' };
}

// Router: choose provider by CCY
async function getAnnualRiskFree(ccy) {
  if (ccy === 'USD') return fetchUSDFromYahooIRX();
  if (ccy === 'EUR') return fetchEURFromECB();
  if (ccy === 'GBP') return fetchGBPFromBoE();
  if (ccy === 'JPY') return fetchJPYFromBoJ();
  if (ccy === 'CHF') return fetchCHFFromSNB();
  if (ccy === 'CAD') return fetchCADFromBoCValet();
  return null; // triggers fallback
}

// ───────────────────────── Utilities ─────────────────────────

function buildPayload({ rAnnual, basisOut, ccy, asOf, source, fallback = false, reason = null }) {
  const r = basisOut === 'cont' ? toCont(rAnnual) : rAnnual;
  const meta = { ttlSeconds: TTL_MS / 1000 };
  if (fallback) {
    meta.fallback = true;
    if (reason) meta.reason = reason;
    const last = LAST_GOOD.get(ccy);
    if (last) meta.lastGood = last;
  }
  return { r, basis: basisOut, ccy, asOf, source, meta };
}

/** GET /api/riskfree?ccy=USD&basis=annual|cont */
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const ccyParam = (searchParams.get('ccy') || 'USD').toUpperCase();
    const basisParam = (searchParams.get('basis') || 'annual').toLowerCase();

    const ccy = SUPPORTED.has(ccyParam) ? ccyParam : 'USD';
    const basisOut = basisParam === 'cont' ? 'cont' : 'annual';

    // Micro-cache
    const cacheKey = mkey('riskfree', ccy, basisOut);
    const cached = mget(cacheKey);
    if (cached) {
      return NextResponse.json(cached, {
        status: 200,
        headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=30' },
      });
    }

    // Provider flow with uniform fallback envelope
    let provider, rAnnual, asOf, source, payload;

    try {
      provider = await getAnnualRiskFree(ccy);
      if (provider && typeof provider.value === 'number') {
        rAnnual = provider.value;
        asOf = provider.asOf || new Date().toISOString();
        source = provider.source || 'provider';
        payload = buildPayload({ rAnnual, basisOut, ccy, asOf, source, fallback: false });
        LAST_GOOD.set(ccy, { rAnnual, asOf, source }); // remember last good annual value
      } else {
        throw new Error('no_provider_data');
      }
    } catch (e) {
      rAnnual = FALLBACKS[ccy] ?? FALLBACKS.USD;
      asOf = new Date().toISOString();
      source = 'fallback';
      payload = buildPayload({
        rAnnual, basisOut, ccy, asOf, source, fallback: true,
        reason: provider ? 'provider_invalid' : 'no_provider',
      });
    }

    mset(cacheKey, payload, TTL_MS);
    return NextResponse.json(payload, {
      status: 200,
      headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=30' },
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'unexpected_error', message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
