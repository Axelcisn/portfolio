// app/api/market/stats/route.js
// Runtime: Node.js (Vercel). Market stats API with ERP and clean meta.
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────
// Formulas (LaTeX, for reference)
// • Log return (interval Δ): r_\Delta = \ln\!\left(\frac{P_t}{P_{t-1}}\right)
// • Simple return (interval Δ): R_\Delta = \frac{P_t}{P_{t-1}} - 1
// • Annualization (daily intervals):
//   \mu_{\text{geom}} = \bar{r}_\Delta \cdot 252
//   \mu_{\text{arith}} = \overline{R_\Delta} \cdot 252
//   \sigma = s_{r_\Delta} \cdot \sqrt{252}
// • Equity risk premium: \mathrm{ERP} = E(R_m) - r_f
// • Compounding conversions:
//   r_{\text{cont}} = \ln(1 + r_{\text{annual}})
//   r_{\text{annual}} = e^{r_{\text{cont}}} - 1
// All rates are decimals per year; time basis is returned in meta.
// ─────────────────────────────────────────────────────────────

const TTL_MS = 60 * 1000;
const cache = new Map();

// Normalize common aliases to Yahoo symbols
function normalizeIndex(ix) {
  const q = (ix || '^GSPC').toUpperCase().trim();
  const map = {
    'SPX': '^GSPC',
    '^SPX': '^GSPC',
    'S&P500': '^GSPC',
    'GSPC': '^GSPC',

    'NDX': '^NDX',
    '^NDX': '^NDX',

    'DJI': '^DJI',
    '^DJI': '^DJI',

    'RUT': '^RUT',
    '^RUT': '^RUT',

    'STOXX': '^STOXX',
    '^STOXX': '^STOXX',

    'EUROSTOXX50': '^SX5E',
    'SX5E': '^SX5E',
    '^SX5E': '^SX5E',

    'FTSE': '^FTSE',
    '^FTSE': '^FTSE',

    'N225': '^N225',
    '^N225': '^N225',

    'SMI': '^SSMI',
    '^SSMI': '^SSMI',

    'TSX': '^GSPTSE',
    '^GSPTSE': '^GSPTSE',
  };
  return map[q] || (q.startsWith('^') ? q : `^${q}`);
}

// Minimal index→currency mapping (overrideable via ?currency=)
function currencyByIndex(index) {
  const map = {
    '^GSPC': 'USD',
    '^NDX': 'USD',
    '^DJI': 'USD',
    '^RUT': 'USD',
    '^STOXX': 'EUR',
    '^SX5E': 'EUR',
    '^FTSE': 'GBP',
    '^N225': 'JPY',
    '^SSMI': 'CHF',
    '^GSPTSE': 'CAD',
  };
  return map[index] || 'USD';
}

// Basis transforms
function toCont(rAnnual) { return Math.log(1 + Number(rAnnual)); }
function toAnnual(rCont) { return Math.exp(Number(rCont)) - 1; } // reserved for completeness

// Conservative fallbacks for r_f (annual, decimal)
const RF_FALLBACK = { USD: 0.03, EUR: 0.02, GBP: 0.03, JPY: 0.001, CHF: 0.005, CAD: 0.03 };

// Yahoo chart fetch
async function fetchYahooChart(symbol, range = '1mo', interval = '1d') {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const closes = result?.indicators?.quote?.[0]?.close || [];
  return { timestamps, closes };
}

// Price series (timestamp ms, price)
async function fetchSeries(symbol, range, interval) {
  const { timestamps, closes } = await fetchYahooChart(symbol, range, interval);
  const out = [];
  for (let i = 0; i < closes.length; i++) {
    const p = closes[i];
    const t = timestamps?.[i];
    if (typeof p === 'number' && p > 0 && typeof t === 'number') {
      out.push({ t: t * 1000, p });
    }
  }
  return out;
}

// Stats from series
function statsFromSeries(series, intervalHint = '1d') {
  const ppYear = intervalHint === '1mo' ? 12 : 252;
  if (!series || series.length < 3) {
    return {
      muGeom: 0,
      muArith: 0,
      sigmaAnn: 0,
      n: 0,
      startDate: null,
      endDate: null,
      ppYear,
    };
  }

  const logR = [];
  const simR = [];
  for (let i = 1; i < series.length; i++) {
    const p0 = series[i - 1].p;
    const p1 = series[i].p;
    const rlog = Math.log(p1 / p0);
    const rsim = p1 / p0 - 1;
    if (Number.isFinite(rlog) && Number.isFinite(rsim)) {
      logR.push(rlog);
      simR.push(rsim);
    }
  }
  const n = logR.length;
  if (n === 0) {
    return {
      muGeom: 0,
      muArith: 0,
      sigmaAnn: 0,
      n: 0,
      startDate: new Date(series[0].t).toISOString(),
      endDate: new Date(series[series.length - 1].t).toISOString(),
      ppYear,
    };
  }

  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const stdev = (a) => {
    const m = mean(a);
    const v = a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1 || 1);
    return Math.sqrt(Math.max(v, 0));
  };

  const muGeom = mean(logR) * ppYear;      // μ_geom = \bar{r}_\Delta · periodsPerYear
  const muArith = mean(simR) * ppYear;     // μ_arith = \overline{R_\Delta} · periodsPerYear
  const sigmaAnn = stdev(logR) * Math.sqrt(ppYear); // σ = s_{log} · √periodsPerYear

  return {
    muGeom,
    muArith,
    sigmaAnn,
    n,
    startDate: new Date(series[0].t).toISOString(),
    endDate: new Date(series[series.length - 1].t).toISOString(),
    ppYear,
  };
}

// Risk-free (annual) via USD ^IRX, others fallback for now
async function fetchRiskFreeAnnual(ccy) {
  if (ccy === 'USD') {
    const { timestamps, closes } = await fetchYahooChart('^IRX', '1mo', '1d');
    let i = closes.length - 1;
    while (i >= 0 && (closes[i] == null || typeof closes[i] !== 'number')) i--;
    if (i >= 0) {
      const pct = closes[i];
      const rAnnual = pct / 100;
      const asOf = new Date((timestamps?.[i] || Date.now() / 1000) * 1000).toISOString();
      return { rAnnual, asOf, source: 'Yahoo ^IRX (13W T-Bill)' };
    }
  }
  return { rAnnual: RF_FALLBACK[ccy] ?? RF_FALLBACK.USD, asOf: new Date().toISOString(), source: 'fallback' };
}

// Map lookback → Yahoo range/interval
function rangeParams(lookback) {
  const lb = (lookback || '5y').toLowerCase();
  switch (lb) {
    case '3m': return { range: '3mo', interval: '1d', window: '3m' };
    case '6m': return { range: '6mo', interval: '1d', window: '6m' };
    case '1y': return { range: '1y', interval: '1d', window: '1y' };
    case '3y': return { range: '3y', interval: '1d', window: '3y' };
    case '5y': return { range: '5y', interval: '1d', window: '5y' };
    case 'ytd': return { range: 'ytd', interval: '1d', window: 'ytd' };
    case '10y': return { range: '10y', interval: '1d', window: '10y' };
    default:   return { range: '5y', interval: '1d', window: '5y' };
  }
}

/** GET /api/market/stats?index=^GSPC&lookback=5y&basis=annual&currency=USD */
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const indexRaw = searchParams.get('index') || '^GSPC';
    const index = normalizeIndex(indexRaw);
    const { range, interval, window } = rangeParams(searchParams.get('lookback'));
    const basisParam = (searchParams.get('basis') || 'annual').toLowerCase();
    const basis = basisParam === 'cont' ? 'cont' : 'annual';

    // Currency inference with optional override
    const ccyOverride = searchParams.get('currency');
    const ccy = (ccyOverride || currencyByIndex(index)).toUpperCase();

    // Micro-cache key
    const key = `${index}:${range}:${interval}:${basis}:${ccy}`;
    const now = Date.now();
    const hit = cache.get(key);
    if (hit && hit.expiry > now) {
      return NextResponse.json(hit.data, {
        status: 200,
        headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=30' },
      });
    }

    // Fetch series and compute stats
    const series = await fetchSeries(index, range, interval);
    const s = statsFromSeries(series, interval);

    // Fetch risk-free (annual) and convert to requested basis
    const rf = await fetchRiskFreeAnnual(ccy);
    const rOut = basis === 'cont' ? toCont(rf.rAnnual) : rf.rAnnual;

    // ERP = E(R_m) - r_f  (use geometric mean by default)
    const erp = s.muGeom - rf.rAnnual;

    const payload = {
      index,
      currency: ccy,
      basis,
      stats: {
        mu_geom: s.muGeom,     // annual (decimal)
        mu_arith: s.muArith,   // annual (decimal)
        sigma: s.sigmaAnn,     // annualized volatility (decimal)
        n: s.n,
      },
      riskFree: {
        r: rOut,
        asOf: rf.asOf,
        source: rf.source,
      },
      mrp: erp, // computed on annual basis against rf.rAnnual
      meta: {
        window,
        startDate: s.startDate,
        endDate: s.endDate,
        periodsPerYear: s.ppYear,
        cacheTTL: TTL_MS / 1000,
        note: 'mrp computed as mu_geom(annual) - r_f(annual)',
      },
    };

    // Cache and return
    cache.set(key, { data: payload, expiry: now + TTL_MS });
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
