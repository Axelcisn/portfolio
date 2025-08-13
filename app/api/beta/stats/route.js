// app/api/beta/stats/route.js
// Runtime: Node.js (Vercel). Computes beta with diagnostics from Yahoo series.
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────
// Formulas (LaTeX, for reference)
// • Log return (interval Δ): r_\Delta = \ln\!\left(\frac{P_t}{P_{t-1}}\right)
// • Beta (simple linear regression with intercept):
//   \beta = \dfrac{\operatorname{Cov}(R_s, R_m)}{\operatorname{Var}(R_m)}
//   \alpha = \bar{R}_s - \beta \bar{R}_m
// • Goodness-of-fit:
//   R^2 = 1 - \dfrac{\sum (R_s - (\alpha + \beta R_m))^2}{\sum (R_s - \bar{R}_s)^2}
// • Standard error of slope:
//   \mathrm{SE}(\beta) = \sqrt{ \dfrac{\mathrm{SSE}/(n-2)}{\sum (R_m - \bar{R}_m)^2} }
// Notes: returns are log returns; \beta is dimensionless.
// ─────────────────────────────────────────────────────────────

const TTL_MS = 60 * 1000;
const cache = new Map();

// Normalize common benchmark aliases to Yahoo symbols
function normalizeBenchmark(ix) {
  const q = (ix || '^GSPC').toUpperCase().trim();
  const map = {
    'SPX': '^GSPC',
    '^SPX': '^GSPC',
    'S&P500': '^GSPC',
    'GSPC': '^GSPC',
    '^GSPC': '^GSPC',
    'NDX': '^NDX',
    '^NDX': '^NDX',
    'FTSE': '^FTSE',
    '^FTSE': '^FTSE',
    'SX5E': '^SX5E',
    '^SX5E': '^SX5E',
    'STOXX': '^STOXX',
    '^STOXX': '^STOXX',
    'N225': '^N225',
    '^N225': '^N225',
  };
  return map[q] || (q.startsWith('^') ? q : `^${q}`);
}

// Very light symbol→default benchmark inference (override with ?benchmark=)
function inferBenchmarkForSymbol(symbol) {
  const s = (symbol || '').toUpperCase();
  if (s.endsWith('.L')) return '^FTSE';
  if (s.endsWith('.PA')) return '^FCHI';
  if (s.endsWith('.DE')) return '^GDAXI';
  if (s.endsWith('.TO')) return '^GSPTSE';
  if (s.endsWith('.HK')) return '^HSI';
  if (s.endsWith('.AX')) return '^AXJO';
  return '^GSPC';
}

// Yahoo chart fetch (range like '5y' | '1y', interval '1d' | '1mo')
async function fetchYahooChart(symbol, range = '1y', interval = '1d') {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?range=${range}&interval=${interval}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status} for ${symbol}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const closes = result?.indicators?.quote?.[0]?.close || [];
  return { timestamps, closes };
}

function buildSeries({ timestamps, closes }) {
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

// Intersect two series by timestamp (ms) and compute log returns
function alignedLogReturns(seriesA, seriesB) {
  // Create maps of last price per day (rounded to day)
  const mA = new Map();
  const mB = new Map();
  const day = 24 * 3600 * 1000;
  for (const s of seriesA) mA.set(Math.floor(s.t / day) * day, s.p);
  for (const s of seriesB) mB.set(Math.floor(s.t / day) * day, s.p);

  // Sort common keys
  const keys = [];
  for (const k of mA.keys()) if (mB.has(k)) keys.push(k);
  keys.sort((a, b) => a - b);

  // Build aligned price arrays
  const pA = [];
  const pB = [];
  for (const k of keys) {
    pA.push(mA.get(k));
    pB.push(mB.get(k));
  }

  // Convert to log-returns
  const Ra = [];
  const Rm = [];
  for (let i = 1; i < pA.length; i++) {
    const ra = Math.log(pA[i] / pA[i - 1]);
    const rm = Math.log(pB[i] / pB[i - 1]);
    if (Number.isFinite(ra) && Number.isFinite(rm)) {
      Ra.push(ra);
      Rm.push(rm);
    }
  }
  return { Ra, Rm, n: Ra.length };
}

// Core regression metrics
function regress(Rm, Ra) {
  const n = Math.min(Rm.length, Ra.length);
  if (n < 3) {
    return {
      beta: 0,
      alpha: 0,
      r2: 0,
      seBeta: null,
      n,
      meanRm: null,
      meanRa: null,
      startIndex: 0,
      endIndex: 0,
    };
  }
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const mX = mean(Rm);
  const mY = mean(Ra);

  let sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = Rm[i] - mX;
    const dy = Ra[i] - mY;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }

  const beta = sxy / (sxx || 1e-12);
  const alpha = mY - beta * mX;

  // Residuals and diagnostics
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const yhat = alpha + beta * Rm[i];
    const e = Ra[i] - yhat;
    sse += e * e;
  }
  const sst = syy;
  const r2 = sst === 0 ? 0 : Math.max(0, 1 - sse / sst);

  // Standard error of beta
  const seBeta = Math.sqrt(Math.max((sse / Math.max(n - 2, 1)) / Math.max(sxx, 1e-12), 0));

  return { beta, alpha, r2, seBeta, n, meanRm: mX, meanRa: mY };
}

// Map lookback to Yahoo range/interval with validation
function rangeParams(range, interval) {
  const r = (range || '5y').toLowerCase();
  const i = (interval || (r === '5y' ? '1mo' : '1d')).toLowerCase();
  const okRange = new Set(['1y', '3y', '5y']);
  const okInt = new Set(['1d', '1mo']);
  const R = okRange.has(r) ? r : '5y';
  const I = okInt.has(i) ? i : (R === '5y' ? '1mo' : '1d');
  return { range: R, interval: I, window: `${R}/${I}` };
}

/** GET /api/beta/stats?symbol=AAPL&benchmark=^GSPC&range=5y&interval=1mo */
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get('symbol') || '').trim();
    if (!symbol) {
      return NextResponse.json(
        { error: 'bad_request', message: 'Query param "symbol" is required' },
        { status: 400 }
      );
    }

    const benchParam = searchParams.get('benchmark');
    const benchmark = normalizeBenchmark(benchParam || inferBenchmarkForSymbol(symbol));
    const { range, interval, window } = rangeParams(
      searchParams.get('range'),
      searchParams.get('interval')
    );

    // Cache
    const key = `${symbol}:${benchmark}:${range}:${interval}`;
    const now = Date.now();
    const hit = cache.get(key);
    if (hit && hit.expiry > now) {
      return NextResponse.json(hit.data, {
        status: 200,
        headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=30' },
      });
    }

    // Fetch series
    const [symRaw, benRaw] = await Promise.all([
      fetchYahooChart(symbol, range, interval),
      fetchYahooChart(benchmark, range, interval),
    ]);

    const sym = buildSeries(symRaw);
    const ben = buildSeries(benRaw);

    // Align and compute log-returns
    const { Ra, Rm, n } = alignedLogReturns(sym, ben);
    const reg = regress(Rm, Ra);

    // Window dates
    const startDate =
      sym.length && ben.length
        ? new Date(Math.max(sym[0].t, ben[0].t)).toISOString()
        : null;
    const endDate =
      sym.length && ben.length
        ? new Date(Math.min(sym[sym.length - 1].t, ben[ben.length - 1].t)).toISOString()
        : null;

    const payload = {
      symbol,
      benchmark,
      params: { range, interval },
      beta: reg.beta,
      alpha: reg.alpha,
      r2: reg.r2,
      seBeta: reg.seBeta,
      n: reg.n,
      window: { startDate, endDate },
      means: { meanMarket: reg.meanRm, meanStock: reg.meanRa },
      meta: {
        cacheTTL: TTL_MS / 1000,
        note:
          'Returns are log-returns; beta = Cov(Rs,Rm)/Var(Rm); R^2 from regression with intercept; SE(beta) per OLS.',
      },
    };

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
