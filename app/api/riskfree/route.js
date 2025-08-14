// app/api/riskfree/route.js
// Runtime: Node.js (Vercel). Risk-free rate API with robust fallbacks, shared cache,
// and first-party providers: USD (^IRX), EUR (€STR via ECB SDMX), CAD (BoC Valet 3M T-bill).
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
function toAnnual(rCont) { return Math.exp(Number(rCont)) - 1; }

/**
 * Provider: USD 13-week T-Bill via Yahoo Finance (^IRX).
 * Yahoo close is a percentage; convert to decimal/year.
 */
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

  const pct = closes[i]; // e.g., 5.12 (%)
  const rAnnual = Number(pct) / 100;
  const asOf = new Date((timestamps?.[i] || Date.now() / 1000) * 1000).toISOString();

  return { value: rAnnual, asOf, source: 'Yahoo ^IRX (13W T-Bill)', basis: 'annual' };
}

/**
 * Provider: EUR via ECB €STR (SDMX-JSON).
 * Endpoint (latest observation): https://sdw-wsrest.ecb.europa.eu/service/data/ESTR/D?lastNObservations=1
 * Accept header must request SDMX JSON.
 * Returned unit is percentage; convert to decimal/year.
 */
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

  // Pick first series' last observation
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
    break; // first series is enough (daily €STR)
  }

  if (lastValue == null || lastIdx == null) throw new Error('ECB €STR: no observations');

  // SDMX observation index → date id (e.g., "2025-08-12")
  const asOf = obsDim?.[lastIdx]?.id || new Date().toISOString();
  // Convert percentage to decimal per year (e.g., 3.80 → 0.0380)
  const rAnnual = lastValue > 1 ? lastValue / 100 : lastValue;

  return { value: rAnnual, asOf: new Date(asOf).toISOString(), source: 'ECB €STR (SDMX)', basis: 'annual' };
}

/**
 * Provider: CAD 3M T-bill via Bank of Canada Valet API.
 * Series: TB.CDN.90D.MID (“Treasury bills - 3 month”), unit = percent → convert to decimal/year.
 * Endpoint (latest): https://www.bankofcanada.ca/valet/observations/TB.CDN.90D.MID/json?recent=1
 */
async function fetchCADFromBoCValet() {
  const url = 'https://www.bankofcanada.ca/valet/observations/TB.CDN.90D.MID/json?recent=1';
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`BoC Valet HTTP ${res.status}`);
  const json = await res.json();

  const obs = json?.observations;
  if (!Array.isArray(obs) || obs.length === 0) throw new Error('BoC Valet: no observations');

  // The series value typically sits under key "TB.CDN.90D.MID": { v: "2.66" }
  const last = obs[obs.length - 1];
  const date = last?.d || new Date().toISOString();
  const node = last?.['TB.CDN.90D.MID'];
  const v = node && (typeof node.v === 'string' || typeof node.v === 'number') ? Number(node.v) : NaN;
  if (!Number.isFinite(v)) throw new Error('BoC Valet: invalid value');

  const rAnnual = v / 100; // percent → decimal/year
  const asOf = new Date(date).toISOString();

  return { value: rAnnual, asOf, source: 'Bank of Canada Valet (TB.CDN.90D.MID)', basis: 'annual' };
}

/**
 * Minimal CCY router.
 * Phase 2 will add: GBP (SONIA), JPY (TONA), CHF (SARON).
 */
async function getAnnualRiskFree(ccy) {
  if (ccy === 'USD') return fetchUSDFromYahooIRX();
  if (ccy === 'EUR') return fetchEURFromECB();
  if (ccy === 'CAD') return fetchCADFromBoCValet();
  // TODO: GBP→SONIA (BoE), JPY→TONA (BoJ), CHF→SARON (SIX/SNB)
  return null; // no provider → fallback path
}

/** Build normalized JSON payload (backward-compatible + richer meta). */
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
        // remember last good for this CCY (annual basis)
        LAST_GOOD.set(ccy, { rAnnual, asOf, source });
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
