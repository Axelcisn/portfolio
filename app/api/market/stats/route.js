// app/api/market/stats/route.js
// Runtime: Node.js (Vercel). Compute market stats with clean meta and ERP.
// ─────────────────────────────────────────────────────────────
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────
// Formulas (LaTeX, for reference)
// • Log return (daily): r_d = \ln\!\left(\frac{P_t}{P_{t-1}}\right)
// • Simple return (daily): R_d = \frac{P_t}{P_{t-1}} - 1
// • Annualization (daily interval):
//   \mu_{\text{geom}} = \bar{r}_d \cdot 252
//   \mu_{\text{arith}} = \overline{R_d} \cdot 252
//   \sigma = s_{r_d} \cdot \sqrt{252}
// • Equity risk premium: \mathrm{ERP} = E(R_m) - r_f
// • Compounding conversions:
//   r_{\text{cont}} = \ln(1 + r_{\text{annual}})
//   r_{\text{annual}} = e^{r_{\text{cont}}} - 1
// All rates are decimals per year; time basis explicitly returned in meta.
// ─────────────────────────────────────────────────────────────

const TTL_MS = 60 * 1000;
const cache = new Map();

// Yahoo index normalization (minimal but practical)
function normalizeIndex(ix) {
  const q = (ix || '^GSPC').toUpperCase().trim();
  const map = {
    SPX: '^GSPC',
    '^SPX': '^GSPC',
    S&P500: '^GSPC',
    GSPC: '^GSPC',
    NDX: '^NDX',
    '^NDX': '^NDX',
    DJI: '^DJI',
    '^DJI': '^DJI',
    RUT: '^RUT',
    '^RUT': '^RUT',
    STOXX: '^STOXX',
    '^STOXX': '^STOXX',
    EUROSTOXX50: '^SX5E',
    SX5E: '^SX5E',
    '^SX5E': '^SX5E',
    FTSE: '^FTSE',
    '^FTSE': '^FTSE',
    N225: '^N225',
    '^N225': '^N225',
    SMI: '^SSMI',
    '^SSMI': '^SSMI',
    TSX: '^GSPTSE',
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
function toAnnual(rCont) { return Math.exp(Number(rCont)) - 1; }

// Conservative fallbacks for r_f (annual, decimal)
const RF_FALLBACK = { USD: 0.03, EUR: 0.02, GBP: 0.03, JPY: 0.001, CHF: 0.005, CAD: 0.03 };

// Pull last close for a Yahoo symbol and range
async function fetchYahooLast(symbol, range = '1mo', interval = '1d') {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  const t = result?.timestamp || [];
  const c = result?.indicators?.quote?.[0]?.close || [];
  return { timestamps: t, closes: c };
}

// Fetch a price series for stats
async function fetchSeries(symbol, range, interval) {
  const { timestamps, closes } = await fetchYahooLast(symbol, range, interval);
  // Filter out nulls, keep aligned arrays
  const arr = [];
  for (let i = 0; i < closes.length; i++) {
    const v = closes[i];
    const ts = timestamps?.[i];
    if (typeof v === 'number' && v > 0 && typeof ts === 'number') {
      arr.push({ t: ts * 1000, p: v });
    }
  }
  return arr;
}

// Compute stats from price series
function statsFromSeries(series, intervalHint = '1d') {
  if (!series || series.length < 3) {
    return {
      muGeom: 0, muArith: 0, sigmaAnn: 0, n: 0,
      startDate: null, endDate: null, ppYear: intervalHint === '1mo' ? 12 : 252,
    };
  }
  const ppYear = intervalHint === '1mo' ? 12 : 252;
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
      muGeom: 0, muArith: 0, sigmaAnn: 0, n: 0,
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
  const muArith = mean(simpClip(sinify(simR))) * ppYear; // robust mean for simple returns
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

// Slightly robustify simple returns mean (trim tiny extremes)
function sinify(a){ return a; } // placeholder hook (kept simple/transparent)
function simpClip(a){
  if (a.length < 10) return a;
  const b = [...a].sort((x,y)=>x-y);
  const k = Math.floor(a.length * 0.01); // 1% trim on each tail
  return b.slice(k, b.length - k);
}

// Risk-free (annual) via quick provider: USD from ^IRX, others fallback for now
async function fetchRiskFreeAnnual(ccy) {
  if (ccy === 'USD') {
    const { closes, timestamps } = await fetchYahooLast('%5EIRX', '1mo', '1d');
    let i = closes.length - 1;
    while (i >= 0 && (closes[i] == null || typeof closes[i] !== 'number')) i--;
    if (i >= 0) {
      const pct = closes[i];
      const rAnnual = pct / 100;
      const asOf = new Date((timestamps?.[i] || Date.now()/1000) * 1000).toISOString();
      return { rAnnual, asOf, source: 'Yahoo ^IRX (13W T-Bill)' };
    }
  }
  return { rAnnual: RF_FALLBACK[ccy] ?? RF_FALLBACK.USD, asOf: new Date().toISOString(), source: 'fallback' };
}

// Map lookback param to Yahoo range/interval
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
    default: return { range: '5y', interval: '1d', window: '5y' };
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

    // ERP = E(R_m) - r_f (use geometric mean by default)
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
