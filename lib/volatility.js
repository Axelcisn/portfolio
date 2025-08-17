/* lib/volatility.js
   Helpers for annualized volatility (σ) from Live IV (constant-maturity capable) or Historical prices.
   - IV path: choose expiries bracketing cmDays, select ATM by forward, extract IV (vendor or BS inversion),
              variance-blend to T*; fall back to single-expiry ATM IV; final fallback is null.
   - Hist path: Yahoo daily closes -> log returns -> σ_ann using shared series helpers.
*/

import {
  normalizeChain,
  nearestExpiriesToDays,
  yearFracFromDays,
  atmByForward as atmByFwd,
  ivFromChainMid,
  varianceBlend,
} from "./volatility/options.js";
import {
  cleanPrices,
  statsFromSeries,
  realizedSigmaAnn,
} from "./volatility/series.js";

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
      const atm = atmByFwd(rec, { S0: spot, r, q, T });
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
