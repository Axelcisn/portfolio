// components/Strategy/useMonteCarlo.js
"use client";

import { useCallback, useState } from "react";

// Prefer hub RNG if available; fall back locally.
import quantDefault, * as qhub from "lib/quant/index.js";

/* ---------- tiny hub-pick shims ---------- */
const pick = (name, fb) => {
  const fromNamed = qhub?.[name];
  const fromDef = quantDefault?.[name];
  return typeof fromNamed === "function"
    ? fromNamed
    : typeof fromDef === "function"
    ? fromDef
    : fb;
};

// try several common names for the same thing
const pickAny = (names = [], fb) => {
  for (const n of names) {
    const f = qhub?.[n] || quantDefault?.[n];
    if (typeof f === "function") return f;
  }
  return fb;
};

/* ---------- local fallbacks ---------- */
function localRandn() {
  // Box–Muller (single draw)
  const u1 = Math.random() || 1e-12;
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
function localRandnArray(n) {
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = localRandn();
  return out;
}
function localGbmDraws({ S0, mu, sigma, T, n, randnArray }) {
  const a = (mu - 0.5 * sigma * sigma) * T;
  const b = sigma * Math.sqrt(T);
  const zs = (randnArray || localRandnArray)(n);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = S0 * Math.exp(a + b * zs[i]);
  return out;
}

/* ---------- resolve hub helpers (if present) ---------- */
const seedFn = pickAny(["seed", "rngSeed", "setSeed", "srand"], null);
const hubRandnOne = pickAny(["randn", "randomNormal", "normal", "gauss", "gaussian"], localRandn);
const hubRandnArray =
  pickAny(["randnArray", "normalArray", "randomNormals", "normalDraws", "gaussArray", "gaussianArray"], null) ||
  ((n) => {
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) out[i] = hubRandnOne();
    return out;
  });

const hubGbmDraws = pickAny(["gbmDraws", "gbmTerminalDraws"], null);
const hubLnDraws  = pickAny(["lnDraws", "gbmLnDraws", "logReturnDraws"], null);

/**
 * Monte-Carlo for terminal price S_T using GBM:
 * S_T = S0 * exp((mu - 0.5*sigma^2)T + sigma*sqrt(T)*Z),  Z~N(0,1)
 * Batches the work so UI stays responsive and exposes progress.
 * Returns:
 *  - xs: bin centers
 *  - ys: heights normalized to [0,1] (for drawing)
 *  - pdf: probabilities per bin (sum=1)
 *  - band: {q01,q05,q95,q99}
 */
export default function useMonteCarlo() {
  const [xs, setXs] = useState([]);
  const [ys, setYs] = useState([]);
  const [pdf, setPdf] = useState([]);
  const [band, setBand] = useState({ q01: null, q05: null, q95: null, q99: null });
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const run = useCallback(
    async ({
      S0,
      sigma,
      mu = 0,
      T = 30 / 365,
      n = 500_000,
      bins = 140,
      minX,
      maxX,
      seed, // optional: if hub supports seeding, we'll pass it along
    }) => {
      if (!(S0 > 0) || !(sigma > 0) || !(T > 0)) {
        setXs([]); setYs([]); setPdf([]); setBand({ q01: null, q05: null, q95: null, q99: null });
        setProgress({ done: 0, total: 0 });
        return;
      }

      // best-effort seed (hub only)
      try { if (seedFn && seed != null) seedFn(seed); } catch {}

      const lo = Number.isFinite(minX) ? minX : S0 * 0.6;
      const hi = Number.isFinite(maxX) ? maxX : S0 * 1.4;
      const step = (hi - lo) / bins;

      const counts = new Float64Array(bins);
      const total = Math.max(1, Math.floor(n));
      const batch = 20_000;
      let done = 0;

      setProgress({ done, total });

      // small helper: bin a batch of ST values
      const binBatch = (arr) => {
        for (let i = 0; i < arr.length; i++) {
          const ST = arr[i];
          let idx = Math.floor((ST - lo) / step);
          if (idx < 0) idx = 0;
          else if (idx >= bins) idx = bins - 1;
          counts[idx] += 1;
        }
      };

      while (done < total) {
        const m = Math.min(batch, total - done);

        // Prefer hub vectorized generators if present, with safe fallbacks.
        let STs = null;

        if (hubGbmDraws) {
          try {
            const out = hubGbmDraws({ S0, mu, sigma, T, n: m, seed });
            if (out && typeof out.length === "number") STs = out;
          } catch {}
        }

        if (!STs && hubLnDraws) {
          try {
            // Assume ln(S_T / S0) draws of length m.
            const lns = hubLnDraws({ mu: (mu - 0.5 * sigma * sigma) * T, sigma: sigma * Math.sqrt(T), n: m, seed });
            if (lns && typeof lns.length === "number") {
              const out = new Float64Array(lns.length);
              for (let i = 0; i < lns.length; i++) out[i] = S0 * Math.exp(lns[i]);
              STs = out;
            }
          } catch {}
        }

        if (!STs) {
          // Last resort: generate normals and map via GBM locally.
          const zs = hubRandnArray(m);
          STs = localGbmDraws({ S0, mu, sigma, T, n: m, randnArray: () => zs });
        }

        binBatch(STs);

        done += m;
        setProgress({ done, total });
        await new Promise(requestAnimationFrame);
      }

      const outXs = Array.from({ length: bins }, (_, i) => lo + (i + 0.5) * step);
      const maxCount = Math.max(...counts);
      const outYs = Array.from(counts, (c) => (maxCount > 0 ? c / maxCount : 0));

      // probabilities (sum to 1)
      const tot = counts.reduce((acc, v) => acc + v, 0) || 1;
      const outPdf = Array.from(counts, (c) => c / tot);

      // quantiles via histogram CDF
      const cdf = new Float64Array(bins);
      let acc = 0;
      for (let i = 0; i < bins; i++) { acc += counts[i]; cdf[i] = acc; }
      const qAt = (p) => {
        const target = p * (cdf[bins - 1] || 1);
        let i = 0;
        while (i < bins && cdf[i] < target) i++;
        return outXs[Math.min(i, bins - 1)];
      };

      setXs(outXs);
      setYs(outYs);
      setPdf(outPdf);
      setBand({ q01: qAt(0.01), q05: qAt(0.05), q95: qAt(0.95), q99: qAt(0.99) });
    },
    []
  );

  return { xs, ys, pdf, band, progress, run };
}
