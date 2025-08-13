// app/api/riskfree/route.js
// Runtime: Node.js (Vercel). Dynamic: always compute fresh (we also add a small in-memory TTL cache).
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────
// Formulas (LaTeX):
// • Continuous from annual: r_{cont} = \ln(1 + r_{annual})
// • Annual from continuous: r_{annual} = e^{r_{cont}} - 1
// All rates are decimals per year.
// ─────────────────────────────────────────────────────────────

const TTL_MS = 60 * 1000; // micro-cache TTL
const cache = new Map();

/** Supported currency codes for the contract (some use robust fallbacks in this first pass). */
const SUPPORTED = new Set(['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD']);

/** Conservative fallbacks (decimal/year) used only if providers fail. */
const FALLBACKS = {
  USD: 0.0300, // 3.00%
  EUR: 0.0200, // 2.00%
  GBP: 0.0300, // 3.00%
  JPY: 0.0010, // 0.10%
  CHF: 0.0050, // 0.50%
  CAD: 0.0300, // 3.00%
};

/** Basis transforms */
function toCont(rAnnual) {
  return Math.log(1 + Number(rAnnual));
}
function toAnnual(rCont) {
  return Math.exp(Number(rCont)) - 1;
}

/**
 * Provider: USD 13-week T-Bill via Yahoo Finance (^IRX).
 * Yahoo returns percentage; we convert to decimal/year.
 */
async function fetchUSDFromYahooIRX() {
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/%5EIRX?range=1mo&interval=1d';
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Yahoo IRX HTTP ${res.status}`);
  const json = await res.json();

  const result = json?.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const closes = result?.indicators?.quote?.[0]?.close || [];

  // Pick last non-null close
  let i = closes.length - 1;
  while (i >= 0 && (closes[i] === null || typeof closes[i] !== 'number')) i -= 1;
  if (i < 0) throw new Error('Yahoo IRX: no close values');

  const pct = closes[i]; // percentage (e.g., 5.12)
  const rAnnual = Number(pct) / 100; // decimal/year
  const asOf = new Date((timestamps?.[i] || Date.now() / 1000) * 1000).toISOString();

  return { value: rAnnual, asOf, source: 'Yahoo ^IRX (13W T-Bill)', basis: 'annual' };
}

/**
 * Minimal CCY router.
 * For EUR/others we currently rely on conservative fallbacks; Phase 2 will plug first-party sources.
 */
async function getAnnualRiskFree(ccy) {
  if (ccy === 'USD') return fetchUSDFromYahooIRX();

  // Placeholder for EUR/GBP/JPY/CHF/CAD providers to be added in Phase 2.
  // Return null to trigger explicit fallback envelope below.
  return null;
}

/** Build a normalized JSON payload */
function buildPayload({ rAnnual, basisOut, ccy, asOf, source }) {
  const r = basisOut === 'cont' ? toCont(rAnnual) : rAnnual;
  return {
    r,
    basis: basisOut,
    ccy,
    asOf,
    source,
    meta: { ttlSeconds: TTL_MS / 1000 },
  };
}

/** GET /api/riskfree?ccy=USD&basis=annual|cont */
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const ccyParam = (searchParams.get('ccy') || 'USD').toUpperCase();
    const basisParam = (searchParams.get('basis') || 'annual').toLowerCase();

    const ccy = SUPPORTED.has(ccyParam) ? ccyParam : 'USD';
    const basisOut = basisParam === 'cont' ? 'cont' : 'annual';
    const cacheKey = `${ccy}:${basisOut}`;
    const now = Date.now();

    // Micro-cache
    const hit = cache.get(cacheKey);
    if (hit && hit.expiry > now) {
      return NextResponse.json(hit.data, {
        status: 200,
        headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=30' },
      });
    }

    // Try provider
    let provider = await getAnnualRiskFree(ccy);
    let rAnnual, asOf, source;

    if (provider && typeof provider.value === 'number') {
      rAnnual = provider.value;
      asOf = provider.asOf || new Date().toISOString();
      source = provider.source || 'provider';
    } else {
      // Explicit fallback (documented)
      rAnnual = FALLBACKS[ccy] ?? FALLBACKS.USD;
      asOf = new Date().toISOString();
      source = 'fallback';
    }

    const data = buildPayload({ rAnnual, basisOut, ccy, asOf, source });

    // Save in cache
    cache.set(cacheKey, { data, expiry: now + TTL_MS });

    return NextResponse.json(data, {
      status: 200,
      headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=30' },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: 'unexpected_error',
        message: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}
