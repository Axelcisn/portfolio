// lib/beta.js
// Beta helpers: compute CAPM beta using Yahoo daily adjusted closes

import { yahooDailyCloses } from "./yahoo.js";

function toYMD(ms) {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function marketIndexForSymbol(symbol) {
  const s = String(symbol || "").toUpperCase();
  if (s.endsWith(".MI")) return "^FTSEMIB.MI";   // Italy
  if (s.endsWith(".L"))  return "^FTSE";         // UK
  if (s.endsWith(".PA")) return "^FCHI";         // France
  if (s.endsWith(".DE")) return "^GDAXI";        // Germany
  if (s.endsWith(".ST")) return "^OMXS30";       // Sweden
  if (s.endsWith(".ES")) return "^IBEX";         // Spain
  if (s.endsWith(".HK")) return "^HSI";          // Hong Kong
  // default US
  return "^GSPC";
}

function logReturnsFromSeries(series) {
  // series: [{ t: ms, close: number }, ...] ascending
  const out = [];
  for (let i = 1; i < series.length; i++) {
    const p0 = series[i - 1].close;
    const p1 = series[i].close;
    if (p0 > 0 && p1 > 0) {
      out.push({ d: toYMD(series[i].t), r: Math.log(p1 / p0) });
    }
  }
  return out;
}

export async function computeBeta(symbol, range = "1y", interval = "1d") {
  const sym = String(symbol || "").trim().toUpperCase();
  const bench = marketIndexForSymbol(sym);

  const [sSeries, bSeries] = await Promise.all([
    yahooDailyCloses(sym, range, interval),
    yahooDailyCloses(bench, range, interval),
  ]);

  const sRets = logReturnsFromSeries(sSeries);
  const bRets = logReturnsFromSeries(bSeries);

  // align by date
  const bMap = new Map(bRets.map((x) => [x.d, x.r]));
  const pairs = [];
  for (const sr of sRets) {
    const br = bMap.get(sr.d);
    if (Number.isFinite(br)) pairs.push([sr.r, br]);
  }

  if (pairs.length < 20) return { beta: null, n: pairs.length };

  // sample covariance / variance
  const n = pairs.length;
  const meanS = pairs.reduce((a, p) => a + p[0], 0) / n;
  const meanB = pairs.reduce((a, p) => a + p[1], 0) / n;

  let cov = 0;
  let varB = 0;
  for (const [rs, rb] of pairs) {
    cov += (rs - meanS) * (rb - meanB);
    varB += (rb - meanB) * (rb - meanB);
  }
  cov /= (n - 1);
  varB /= (n - 1);

  if (varB <= 0) return { beta: null, n };
  return { beta: cov / varB, n, benchmark: bench };
}
