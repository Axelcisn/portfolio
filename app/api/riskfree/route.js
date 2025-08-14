// app/api/riskfree/route.js
// Runtime: Node.js (Vercel). Risk-free rate API with robust fallbacks and shared cache.
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
 * Minimal CCY router (Phase 2 will plug real providers for non-USD).
 * Return null to trigger the uniform fallback envelope.
 */
async function getAnnualRiskFree(ccy) {
  if (ccy === 'USD') return fetchUSDFromYahooIRX();
  return null; // no provider yet → fallback path
}

/** Build normalized JSON payload (backward-compatible + richer meta). */
function buildPayload({ rAnnual, basisOut, ccy, asOf, source, fallback = false, reason = null }) {
  const r = basisOut === 'cont' ? toCont(rAnnual) : rAnnual;
  const meta = {
    ttlSeconds: TTL_MS / 1000,
  };
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
