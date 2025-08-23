/* lib/volatility.js
   Helpers for annualized volatility (σ) from Live IV (constant-maturity capable) or Historical prices.
   - IV path: choose expiries bracketing cmDays, select ATM by forward, extract IV (vendor or BS inversion),
              variance-blend to T*; fall back to single-expiry ATM IV; final fallback is null.
   - Hist path: Yahoo daily closes -> log returns -> σ_ann using shared series helpers.
*/

import {
  d1 as d1RN,
  d2 as d2RN,
  callPrice,
  putPrice,
  vega as vegaRN,
  impliedVol,
} from "./quant/index.js";

// ---------- Option chain utilities ----------
const isFiniteNum = (x) => typeof x === "number" && Number.isFinite(x);

export function yearFracFromDays(days, basisDays = 365) {
  const d = Math.max(0, Number(days) || 0);
  const b = Math.max(1, Number(basisDays) || 365);
  return d / b;
}

export function daysBetween(nowMs, futureEpochSec) {
  const futureMs = (Number(futureEpochSec) || 0) * 1000;
  const dms = Math.max(0, futureMs - nowMs);
  return dms / (1000 * 60 * 60 * 24);
}

export function normalizeChain(chain) {
  if (!chain) return [];
  let opts = [];
  if (Array.isArray(chain)) {
    opts = chain;
  } else if (Array.isArray(chain?.options)) {
    opts = chain.options;
  } else if (Array.isArray(chain?.result?.[0]?.options)) {
    opts = chain.result[0].options;
  } else if (chain?.chain && Array.isArray(chain.chain)) {
    opts = chain.chain;
  }
  const out = [];
  for (const it of opts) {
    const exp = it?.expirationDate ?? it?.expiration ?? it?.exp ?? it?.expirationTime;
    const calls = Array.isArray(it?.calls) ? it.calls : [];
    const puts = Array.isArray(it?.puts) ? it.puts : [];
    if (isFiniteNum(exp) && (calls.length || puts.length)) {
      out.push({ expSec: Number(exp), calls, puts });
    }
  }
  out.sort((a, b) => a.expSec - b.expSec);
  return out;
}

export function nearestExpiriesToDays(chain, cmDays = 30, nowMs = Date.now()) {
  const norm = normalizeChain(chain);
  if (!norm.length) return { below: null, above: null, list: [] };
  const list = norm.map((e) => {
    const days = daysBetween(nowMs, e.expSec);
    return { ...e, days, T: yearFracFromDays(days) };
  });
  let below = null;
  let above = null;
  for (const e of list) {
    if (e.days < cmDays) below = e;
    if (e.days >= cmDays) {
      above = e;
      break;
    }
  }
  if (!below) below = list[0] || null;
  if (!above) above = list[list.length - 1] || null;
  return { below, above, list };
}

export const d1 = d1RN;
export const d2 = d2RN;
export const vega = vegaRN;

export function bsCall(S, K, r = 0, q = 0, sigma, T) {
  return callPrice({ S0: Number(S), K: Number(K), T: Number(T), sigma: Number(sigma), r: Number(r) || 0, q: Number(q) || 0 });
}
export function bsPut(S, K, r = 0, q = 0, sigma, T) {
  return putPrice({ S0: Number(S), K: Number(K), T: Number(T), sigma: Number(sigma), r: Number(r) || 0, q: Number(q) || 0 });
}

export function invertIV({ isCall, S, K, r = 0, q = 0, T, priceMid, sigmaInit = 0.25 }) {
  if (!isFiniteNum(S) || !isFiniteNum(K) || !isFiniteNum(T) || !isFiniteNum(priceMid)) return null;
  if (!(priceMid > 0)) return null;
  const type = isCall ? "call" : "put";
  const sigma = impliedVol({ type, price: priceMid, S0: S, K, T, r, q, sigmaInit });
  return isFiniteNum(sigma) ? sigma : null;
}

export function ivFromChainMid(opt, { S, r = 0, q = 0, T }) {
  if (!opt) return null;
  let iv = opt.impliedVolatility;
  if (isFiniteNum(iv)) {
    if (iv > 1) iv = iv / 100;
    if (iv > 0 && iv < 10) return iv;
  }
  const bid = Number(opt.bid),
    ask = Number(opt.ask),
    last = Number(opt.lastPrice ?? opt.last ?? opt.price);
  let mid = null;
  if (isFiniteNum(bid) && isFiniteNum(ask) && bid > 0 && ask > 0) mid = (bid + ask) / 2;
  else if (isFiniteNum(last) && last > 0) mid = last;
  if (!isFiniteNum(mid) || mid <= 0) return null;
  const K = Number(opt.strike);
  const isCall = String(opt.contractSymbol || opt.contract || "").includes("C") || opt?.type === "call";
  if (!isFiniteNum(K) || K <= 0) return null;
  const sigma = invertIV({ isCall, S, K, r, q, T, priceMid: mid });
  return isFiniteNum(sigma) ? sigma : null;
}

export function atmByForward(expiryRec, { S0, r = 0, q = 0, T }) {
  if (!expiryRec) return null;
  const calls = Array.isArray(expiryRec.calls) ? expiryRec.calls : [];
  const puts = Array.isArray(expiryRec.puts) ? expiryRec.puts : [];
  if (!calls.length && !puts.length) return null;
  const F0 = S0 * Math.exp((r - q) * T);
  let best = null;
  let bestDiff = Infinity;
  const scan = (arr, side) => {
    for (const o of arr) {
      const K = Number(o?.strike);
      if (!isFiniteNum(K) || K <= 0) continue;
      const d = Math.abs(K - F0);
      if (d < bestDiff) {
        best = { strike: K, side, opt: o };
        bestDiff = d;
      }
    }
  };
  scan(calls, "call");
  scan(puts, "put");
  return best;
}

export function varianceBlend(iv1, T1, iv2, T2, Tstar) {
  if (!isFiniteNum(iv1) || !isFiniteNum(iv2) || !isFiniteNum(T1) || !isFiniteNum(T2) || !isFiniteNum(Tstar)) {
    return null;
  }
  if (T1 === T2) return iv1;
  const [Ta, Tb] = T1 < T2 ? [T1, T2] : [T2, T1];
  const [iva, ivb] = T1 < T2 ? [iv1, iv2] : [iv2, iv1];
  const T = Math.min(Math.max(Tstar, Ta), Tb);
  const w1 = (Tb - T) / (Tb - Ta);
  const w2 = 1 - w1;
  const varStar = w1 * (iva * iva) + w2 * (ivb * ivb);
  return Math.sqrt(Math.max(varStar, 0));
}

export function constantMaturityATM(chain, { S0, r = 0, q = 0, cmDays = 30, nowMs = Date.now() }) {
  const { below, above } = nearestExpiriesToDays(chain, cmDays, nowMs);
  if (!below && !above) return { iv: null, meta: { note: "no_expiries" } };
  if (!below || !above || below.expSec === above.expSec) {
    const days = (below || above).days;
    const T = yearFracFromDays(days);
    const atm = atmByForward(below || above, { S0, r, q, T });
    if (!atm) return { iv: null, meta: { note: "no_atm_options" } };
    const iv = ivFromChainMid(atm.opt, { S: S0, r, q, T });
    return { iv, meta: { method: "atm_single", T, days, strike: atm.strike, side: atm.side } };
  }
  const T1 = yearFracFromDays(below.days);
  const T2 = yearFracFromDays(above.days);
  const Tstar = yearFracFromDays(cmDays);
  const atm1 = atmByForward(below, { S0, r, q, T: T1 });
  const atm2 = atmByForward(above, { S0, r, q, T: T2 });
  if (!atm1 || !atm2) {
    return { iv: null, meta: { note: "missing_atm", T1, T2, Tstar } };
  }
  const iv1 = ivFromChainMid(atm1.opt, { S: S0, r, q, T: T1 });
  const iv2 = ivFromChainMid(atm2.opt, { S: S0, r, q, T: T2 });
  if (!isFiniteNum(iv1) && !isFiniteNum(iv2)) {
    return { iv: null, meta: { note: "no_iv", T1, T2, Tstar } };
  }
  if (!isFiniteNum(iv1)) {
    return { iv: iv2, meta: { method: "atm_single", T: T2, days: above.days, strike: atm2.strike, side: atm2.side } };
  }
  if (!isFiniteNum(iv2)) {
    return { iv: iv1, meta: { method: "atm_single", T: T1, days: below.days, strike: atm1.strike, side: atm1.side } };
  }
  const ivStar = varianceBlend(iv1, T1, iv2, T2, Tstar);
  return {
    iv: ivStar,
    meta: {
      method: "cm_variance_blend",
      T1,
      T2,
      Tstar,
      days1: below.days,
      days2: above.days,
      strike1: atm1.strike,
      strike2: atm2.strike,
    },
  };
}

// ---------- Time series utilities ----------
export function cleanPrices(timestamps = [], closes = []) {
  const out = [];
  const n = Math.min(Array.isArray(timestamps) ? timestamps.length : 0, Array.isArray(closes) ? closes.length : 0);
  for (let i = 0; i < n; i++) {
    const ts = timestamps[i];
    const px = closes[i];
    if (!isFiniteNum(px) || px <= 0) continue;
    if (!isFiniteNum(ts)) continue;
    const t = ts < 1e12 ? ts * 1000 : ts;
    out.push({ t, p: px });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

export function computeLogReturns(series = []) {
  const r = [];
  for (let i = 1; i < series.length; i++) {
    const p0 = series[i - 1]?.p;
    const p1 = series[i]?.p;
    if (isFiniteNum(p0) && isFiniteNum(p1) && p0 > 0 && p1 > 0) {
      const v = Math.log(p1 / p0);
      if (Number.isFinite(v)) r.push(v);
    }
  }
  return r;
}

export function mean(a = []) {
  if (!a.length) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return s / a.length;
}

export function stdev(a = []) {
  const n = a.length;
  if (n <= 1) return 0;
  const m = mean(a);
  let s = 0;
  for (let i = 0; i < n; i++) {
    const d = a[i] - m;
    s += d * d;
  }
  const varSample = s / (n - 1);
  return Math.sqrt(Math.max(varSample, 0));
}

export function quantile(a = [], p = 0.5) {
  if (!a.length) return NaN;
  if (p <= 0) return Math.min(...a);
  if (p >= 1) return Math.max(...a);
  const b = [...a].sort((x, y) => x - y);
  const idx = (b.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return b[lo];
  const w = idx - lo;
  return b[lo] * (1 - w) + b[hi] * w;
}

export function winsorize(a = [], p = 0.01) {
  if (!a.length) return [];
  const lo = quantile(a, p);
  const hi = quantile(a, 1 - p);
  const out = new Array(a.length);
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    out[i] = x < lo ? lo : x > hi ? hi : x;
  }
  return out;
}

export function annualizeStdev(sd, periods = 252) {
  const s = Number(sd);
  const k = Math.sqrt(Math.max(1, Number(periods) || 252));
  return s * k;
}

export function statsFromSeries(series = [], periodsPerYear = 252) {
  const nPts = series.length;
  if (nPts < 2) {
    return {
      muGeom: 0,
      muArith: 0,
      sigmaAnn: 0,
      n: 0,
      startDate: null,
      endDate: null,
      ppYear: periodsPerYear,
    };
  }
  const logR = computeLogReturns(series);
  const simR = [];
  for (let i = 1; i < series.length; i++) {
    const p0 = series[i - 1].p, p1 = series[i].p;
    const r = p1 / p0 - 1;
    if (Number.isFinite(r)) simR.push(r);
  }
  const muGeom = mean(logR) * periodsPerYear;
  const muArith = mean(simR) * periodsPerYear;
  const sigmaAnn = annualizeStdev(stdev(logR), periodsPerYear);
  return {
    muGeom,
    muArith,
    sigmaAnn,
    n: logR.length,
    startDate: new Date(series[0].t).toISOString(),
    endDate: new Date(series[series.length - 1].t).toISOString(),
    ppYear: periodsPerYear,
  };
}

export function realizedSigmaAnn(series = [], p = 0.01, periodsPerYear = 252) {
  const r = computeLogReturns(series);
  const rw = p > 0 ? winsorize(r, p) : r;
  return annualizeStdev(stdev(rw), periodsPerYear);
}

const Y_BASE = "https://query2.finance.yahoo.com";

// --- tiny helpers ---
const clamp = (x, lo, hi) => Math.min(Math.max(Number(x) || 0, lo), hi);
const n = (x) => {
  const v = Number(x);
  return Number.isFinite(v) ? v : null;
};

// Robust fetch with header merge + no-store
async function jfetch(url, init = {}) {
  const headers = {
    Accept: "application/json, text/plain, */*",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
    ...(init.headers || {}),
  };
  const r = await fetch(url, {
    cache: "no-store",
    ...init,
    headers,
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r;
}

// ------------------- Historical Realized Volatility -------------------

/**
 * Back-compat helper: realized σ from a plain array of closes.
 * Internally delegates to the shared series helpers to avoid duplicating math.
 */
export function computeHistSigmaFromCloses(closes, windowDays = 30) {
  const w = clamp(windowDays | 0, 5, 365);
  const arr = (Array.isArray(closes) ? closes : []).map(n).filter((x) => x && x > 0);
  if (arr.length < w + 1) {
    return { sigmaAnnual: null, sigmaDaily: null, pointsUsed: arr.length };
  }

  // Build a synthetic 1-day grid for the last (w+1) closes, then use shared helpers.
  const tailCloses = arr.slice(-1 - w);
  const nowSec = Math.floor(Date.now() / 1000);
  const ts = [];
  for (let i = 0; i < tailCloses.length; i++) {
    // increasing timestamps, 1 day apart
    ts.push(nowSec - (tailCloses.length - 1 - i) * 24 * 3600);
  }

  const series = cleanPrices(ts, tailCloses);
  if (series.length < 2) {
    return { sigmaAnnual: null, sigmaDaily: null, pointsUsed: series.length };
  }

  const sigmaAnnual = realizedSigmaAnn(series, 0.01, 252);
  const sigmaDaily =
    Number.isFinite(sigmaAnnual) ? sigmaAnnual / Math.sqrt(252) : null;

  return {
    sigmaAnnual,
    sigmaDaily,
    pointsUsed: Math.max(0, series.length - 1),
  };
}

/** Fetch historical σ_ann using Yahoo daily closes + series helpers. */
export async function fetchHistSigma(symbol, windowDays = 30) {
  const sym = String(symbol || "").trim();
  const w = clamp(windowDays | 0, 5, 365);

  const range =
    w <= 35 ? "3mo" :
    w <= 95 ? "6mo" :
    "1y";

  const url = `${Y_BASE}/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=1d&includeAdjustedClose=true`;
  const j = await jfetch(url).then((r) => r.json());
  const res = j?.chart?.result?.[0];

  const timestamps = Array.isArray(res?.timestamp) ? res.timestamp : [];
  const closes =
    res?.indicators?.adjclose?.[0]?.adjclose ??
    res?.indicators?.quote?.[0]?.close ??
    [];

  const series = cleanPrices(timestamps, closes);
  if (series.length < 2) {
    return { sigmaAnnual: null, meta: { pointsUsed: 0, source: "hist" } };
  }

  // Use realizedSigmaAnn on the last w+1 points (w returns)
  const tail = series.slice(-1 - w);
  const sigmaAnnual = realizedSigmaAnn(tail, 0.01, 252);
  const stats = statsFromSeries(tail, 252);

  return {
    sigmaAnnual,
    meta: {
      method: "historical",
      basis: 252,
      pointsUsed: stats.n,
      startDate: stats.startDate,
      endDate: stats.endDate,
      fallback: false,
      source: "hist",
      windowDays: w,
    },
    source: "hist",
  };
}

// --------------------------- Live IV (constant-maturity) ----------------------------

async function yahooOptionsJson(sym, date) {
  const referer = `https://finance.yahoo.com/quote/${encodeURIComponent(sym)}/options?p=${encodeURIComponent(sym)}`;
  const path7 =
    date == null
      ? `/v7/finance/options/${encodeURIComponent(sym)}?corsDomain=finance.yahoo.com`
      : `/v7/finance/options/${encodeURIComponent(sym)}?date=${date}&corsDomain=finance.yahoo.com`;
  const path6 =
    date == null
      ? `/v6/finance/options/${encodeURIComponent(sym)}?corsDomain=finance.yahoo.com`
      : `/v6/finance/options/${encodeURIComponent(sym)}?date=${date}&corsDomain=finance.yahoo.com`;
  try {
    return await jfetch(`${Y_BASE}${path7}`, { headers: { Referer: referer } }).then((r) => r.json());
  } catch {
    return await jfetch(`${Y_BASE}${path6}`, { headers: { Referer: referer } }).then((r) => r.json());
  }
}

/**
 * fetchIvATM(symbol, days)
 * days = target constant-maturity horizon in calendar days (default 30).
 * Returns { sigmaAnnual, meta } where sigmaAnnual is an annual decimal (e.g., 0.24).
 */
export async function fetchIvATM(symbol, days = 30) {
  try {
    const sym = String(symbol || "").trim();
    const cmDays = clamp(days | 0, 7, 365);

    // 1) Fetch "root" chain to get expiries + spot
    const root = await yahooOptionsJson(sym, null);
    const chain0 = root?.optionChain?.result?.[0];
    const expiries = Array.isArray(chain0?.expirationDates) ? chain0.expirationDates : [];
    const spot =
      n(chain0?.quote?.regularMarketPrice) ??
      n(chain0?.quote?.postMarketPrice) ??
      null;

    if (!expiries.length || !spot) {
      return { sigmaAnnual: null, meta: { fallback: true, note: "no_expiries_or_spot" } };
    }

    // 2) Find two expiries bracketing the target cmDays
    const nowSec = Math.floor(Date.now() / 1000);
    const targetSec = nowSec + cmDays * 24 * 3600;

    let belowSec = expiries[0];
    let aboveSec = expiries[expiries.length - 1];
    for (let i = 0; i < expiries.length; i++) {
      const e = expiries[i];
      if (e <= targetSec) belowSec = e;
      if (e >= targetSec) { aboveSec = e; break; }
    }

    // Ensure both are defined
    if (belowSec == null) belowSec = expiries[0];
    if (aboveSec == null) aboveSec = expiries[expiries.length - 1];

    // 3) Fetch options for the two selected expiries (dedupe if equal)
    const need = [...new Set([belowSec, aboveSec])];
    const fetched = await Promise.all(
      need.map(async (sec) => {
        const cj = await yahooOptionsJson(sym, sec);
        const node = cj?.optionChain?.result?.[0];
        const opt = Array.isArray(node?.options?.[0]?.calls) || Array.isArray(node?.options?.[0]?.puts)
          ? node.options[0]
          : null;
        return opt ? { expSec: sec, calls: opt.calls || [], puts: opt.puts || [] } : null;
      })
    );

    const records = fetched.filter(Boolean);
    if (!records.length) {
      return { sigmaAnnual: null, meta: { fallback: true, note: "no_option_records" } };
    }

    // 4) Compute ATM IV at each expiry, then variance-blend to T*
    const r = 0;  // risk-free (annual)
    const q = 0;  // dividend yield (annual)

    const getATMiv = (rec) => {
      const daysToExp = Math.max(0, Math.round((rec.expSec - nowSec) / (24 * 3600)));
      const T = yearFracFromDays(daysToExp);
      const atm = atmByForward(rec, { S0: spot, r, q, T });
      if (!atm) return { iv: null, T, days: daysToExp };
      const iv = ivFromChainMid(atm.opt, { S: spot, r, q, T });
      return { iv, T, days: daysToExp, strike: atm.strike, side: atm.side };
    };

    const ivs = records.map(getATMiv);

    // If only one expiry is available or valid, return that IV
    const valid = ivs.filter((x) => typeof x.iv === "number" && x.iv > 0 && x.iv < 10);
    if (valid.length === 1) {
      const v = valid[0];
      return {
        sigmaAnnual: v.iv,
        meta: {
          method: "atm_single",
          expiry: new Date(need[0] * 1000).toISOString().slice(0, 10),
          days: v.days,
          T: v.T,
          strike: v.strike ?? null,
          fallback: false,
        },
      };
    }

    if (valid.length >= 2) {
      // Pick two nearest around target and blend
      const recBelow = records.find((r) => r.expSec === belowSec) || records[0];
      const recAbove = records.find((r) => r.expSec === aboveSec) || records[records.length - 1];

      const belowInfo = getATMiv(recBelow);
      const aboveInfo = getATMiv(recAbove);

      const T1 = belowInfo.T;
      const T2 = aboveInfo.T;
      const Tstar = yearFracFromDays(cmDays);

      const iv1 = belowInfo.iv;
      const iv2 = aboveInfo.iv;

      let ivStar = null;
      if (typeof iv1 === "number" && typeof iv2 === "number") {
        ivStar = varianceBlend(iv1, T1, iv2, T2, Tstar);
      } else {
        ivStar = (typeof iv1 === "number" ? iv1 : (typeof iv2 === "number" ? iv2 : null));
      }

      if (typeof ivStar === "number" && ivStar > 0 && ivStar < 10) {
        return {
          sigmaAnnual: ivStar,
          meta: {
            method: (typeof iv1 === "number" && typeof iv2 === "number") ? "cm_variance_blend" : "atm_single",
            cmDays,
            T1, T2, Tstar,
            days1: belowInfo.days, days2: aboveInfo.days,
            strike1: belowInfo.strike ?? null, strike2: aboveInfo.strike ?? null,
            fallback: false,
          },
        };
      }
    }

    // 5) Fallback: single nearest expiry, average top-of-book vendor IVs near spot
    try {
      const nearestSec = Math.abs(belowSec - targetSec) <= Math.abs(aboveSec - targetSec) ? belowSec : aboveSec;
      const chainRes = await yahooOptionsJson(sym, nearestSec);
      const node = chainRes?.optionChain?.result?.[0];
      const calls = node?.options?.[0]?.calls || [];
      const puts  = node?.options?.[0]?.puts  || [];
      const all = [...calls, ...puts]
        .filter((o) => n(o?.impliedVolatility) && n(o?.strike))
        .map((o) => ({ iv: n(o.impliedVolatility), k: n(o.strike) }));

      if (all.length > 0) {
        all.sort((a, b) => Math.abs(a.k - spot) - Math.abs(b.k - spot));
        const top = all.slice(0, Math.min(3, all.length));
        const iv = top.reduce((a, b) => a + (b?.iv ?? 0), 0) / (top.length || 1);
        if (iv && iv > 0 && iv < 10) {
          return {
            sigmaAnnual: iv,
            meta: {
              method: "vendor_iv_near_spot",
              expiry: new Date(nearestSec * 1000).toISOString().slice(0, 10),
              optionStrike: top[0]?.k ?? null,
              fallback: true,
            },
          };
        }
      }
    } catch {}

    // Final failure
    return { sigmaAnnual: null, meta: { fallback: true, note: "iv_unavailable" } };
  } catch (e) {
    // Never bubble errors; let caller fall back to historical.
    return { sigmaAnnual: null, meta: { fallback: true, error: String(e?.message || e) } };
  }
}
