// lib/beta.js
// Compute equity beta by regressing daily returns vs a market index.
// Uses Yahoo /chart data (works even when /quote is throttled).

import { yahooDailyCloses } from "./yahoo.js";

// Simple log-return helper (kept local to avoid tight coupling)
function logReturns(arr) {
  const out = [];
  for (let i = 1; i < arr.length; i++) {
    const a = Number(arr[i - 1]);
    const b = Number(arr[i]);
    if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0) {
      out.push(Math.log(b / a));
    }
  }
  return out;
}

function mean(xs) {
  if (!xs?.length) return null;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}
function variance(xs) {
  if (!xs || xs.length < 2) return null;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return s / (xs.length - 1);
}
function covariance(x, y) {
  if (!x || !y) return null;
  const n = Math.min(x.length, y.length);
  if (n < 2) return null;
  const xs = x.slice(-n);
  const ys = y.slice(-n);
  const mx = mean(xs);
  const my = mean(ys);
  let s = 0;
  for (let i = 0; i < n; i++) s += (xs[i] - mx) * (ys[i] - my);
  return s / (n - 1);
}

// Map ticker suffix → market index for regression.
export function marketIndexForSymbol(symbol) {
  const s = String(symbol || "").toUpperCase();
  if (s.includes(".")) {
    const suff = s.split(".").pop();
    switch (suff) {
      case "MI": return "^FTSEMIB.MI";   // Borsa Italiana
      case "DE": return "^GDAXI";        // DAX
      case "FR": return "^FCHI";         // CAC 40
      case "L":
      case "UK": return "^FTSE";         // FTSE 100
      case "TO": return "^GSPTSE";       // TSX
      case "HK": return "^HSI";          // Hang Seng
      case "T":
      case "JP": return "^N225";         // Nikkei 225
      case "SW": return "^SSMI";         // Swiss SMI
      case "MC": return "^IBEX";         // Spain (best-effort)
      default:   return "^GSPC";         // fallback
    }
  }
  // No suffix → assume US
  return "^GSPC";
}

// Compute beta from daily closes over a range (default 1y).
export async function computeBeta(symbol, { range = "1y", interval = "1d" } = {}) {
  const sym = String(symbol || "").trim().toUpperCase();
  if (!sym) throw new Error("symbol required");

  const idx = marketIndexForSymbol(sym);

  // Fetch closes (uses Yahoo /chart endpoint)
  const [sec, mkt] = await Promise.all([
    yahooDailyCloses(sym, range, interval),
    yahooDailyCloses(idx, range, interval),
  ]);

  const secCloses = sec.map((b) => b.close);
  const mktCloses = mkt.map((b) => b.close);

  const rS = logReturns(secCloses);
  const rM = logReturns(mktCloses);

  const n = Math.min(rS.length, rM.length);
  if (n < 30) return { beta: null, index: idx, points: n };

  const rS_cut = rS.slice(-n);
  const rM_cut = rM.slice(-n);

  const cov = covariance(rS_cut, rM_cut);
  const varM = variance(rM_cut);
  if (!Number.isFinite(cov) || !Number.isFinite(varM) || varM === 0) {
    return { beta: null, index: idx, points: n };
  }

  return { beta: cov / varM, index: idx, points: n };
}
