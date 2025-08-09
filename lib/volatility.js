// lib/volatility.js
// Helpers for annualized volatility (σ) from Live IV or Historical prices.

const Y_BASE = "https://query2.finance.yahoo.com";

// --- tiny helpers ---
const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);
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
export function computeHistSigmaFromCloses(closes, windowDays = 30) {
  const w = Math.max(5, Math.min(windowDays | 0, 365));
  const arr = closes.map(n).filter((x) => x && x > 0);
  if (arr.length < w + 1) {
    return { sigmaAnnual: null, sigmaDaily: null, pointsUsed: arr.length };
  }
  const slice = arr.slice(-1 - w); // w returns -> w+1 closes
  const rets = [];
  for (let i = 1; i < slice.length; i++) {
    rets.push(Math.log(slice[i] / slice[i - 1]));
  }
  const m = rets.reduce((a, b) => a + b, 0) / rets.length;
  const varSum = rets.reduce((a, b) => a + (b - m) ** 2, 0);
  const sdDaily = Math.sqrt(varSum / Math.max(1, rets.length - 1));
  const sdAnnual = sdDaily * Math.sqrt(252);
  return {
    sigmaAnnual: sdAnnual,
    sigmaDaily: sdDaily,
    pointsUsed: rets.length,
  };
}

export async function fetchHistSigma(symbol, windowDays = 30) {
  const sym = String(symbol || "").trim();
  const range = windowDays <= 35 ? "3mo" : windowDays <= 95 ? "6mo" : "1y";
  const u = `${Y_BASE}/v8/finance/chart/${encodeURIComponent(
    sym
  )}?range=${range}&interval=1d&includeAdjustedClose=true`;
  const j = await jfetch(u).then((r) => r.json());
  const res = j?.chart?.result?.[0];
  const closes =
    res?.indicators?.adjclose?.[0]?.adjclose ||
    res?.indicators?.quote?.[0]?.close ||
    [];
  const out = computeHistSigmaFromCloses(closes, windowDays);
  return { ...out, source: "hist" };
}

// --------------------------- Live IV (ATM) ----------------------------
async function yahooOptionsJson(sym, date) {
  const referer = `https://finance.yahoo.com/quote/${encodeURIComponent(
    sym
  )}/options?p=${encodeURIComponent(sym)}`;
  const path7 =
    date == null
      ? `/v7/finance/options/${encodeURIComponent(sym)}?corsDomain=finance.yahoo.com`
      : `/v7/finance/options/${encodeURIComponent(
          sym
        )}?date=${date}&corsDomain=finance.yahoo.com`;
  const path6 =
    date == null
      ? `/v6/finance/options/${encodeURIComponent(sym)}?corsDomain=finance.yahoo.com`
      : `/v6/finance/options/${encodeURIComponent(
          sym
        )}?date=${date}&corsDomain=finance.yahoo.com`;
  try {
    return await jfetch(`${Y_BASE}${path7}`, { headers: { Referer: referer } }).then((r) =>
      r.json()
    );
  } catch {
    // Fallback to v6 if v7 returns 401/403/etc.
    return await jfetch(`${Y_BASE}${path6}`, { headers: { Referer: referer } }).then((r) =>
      r.json()
    );
  }
}

export async function fetchIvATM(symbol, days = 30) {
  try {
    const sym = String(symbol || "").trim();
    const horizon = clamp(days | 0, 7, 365);

    // 1) expiries + spot
    const first = await yahooOptionsJson(sym, null);
    const chain0 = first?.optionChain?.result?.[0];
    const expiries = chain0?.expirationDates || [];
    const spot =
      n(chain0?.quote?.regularMarketPrice) ??
      n(chain0?.quote?.postMarketPrice) ??
      null;

    if (!Array.isArray(expiries) || expiries.length === 0 || !spot) {
      return { sigmaAnnual: null, meta: { fallback: true } };
    }

    // 2) expiry nearest to target days
    const nowSec = Math.floor(Date.now() / 1000);
    const target = nowSec + horizon * 24 * 3600;
    let best = expiries[0];
    let bestDist = Math.abs(expiries[0] - target);
    for (const e of expiries) {
      const d = Math.abs(e - target);
      if (d < bestDist) {
        best = e;
        bestDist = d;
      }
    }

    // 3) fetch that expiry chain and pick ATM
    const chainRes = await yahooOptionsJson(sym, best);
    const chain = chainRes?.optionChain?.result?.[0];
    const calls = chain?.options?.[0]?.calls || [];
    const puts = chain?.options?.[0]?.puts || [];

    const all = [...calls, ...puts]
      .filter((o) => n(o?.impliedVolatility) && n(o?.strike))
      .map((o) => ({ iv: n(o.impliedVolatility), k: n(o.strike) }));

    if (all.length === 0) {
      return { sigmaAnnual: null, meta: { fallback: true } };
    }

    all.sort((a, b) => Math.abs(a.k - spot) - Math.abs(b.k - spot));
    const top = all.slice(0, Math.min(3, all.length));
    const iv = top.reduce((a, b) => a + (b?.iv ?? 0), 0) / (top.length || 1);

    if (!iv || iv <= 0) return { sigmaAnnual: null, meta: { fallback: true } };

    return {
      sigmaAnnual: iv, // IV is annualized
      meta: {
        expiry: new Date(best * 1000).toISOString().slice(0, 10),
        optionStrike: top[0]?.k ?? null,
        fallback: false,
      },
    };
  } catch (e) {
    // Never bubble errors; let caller fall back to historical.
    return { sigmaAnnual: null, meta: { fallback: true, error: String(e?.message || e) } };
  }
}
