// components/Strategy/useMonteCarlo.js
"use client";

import { useCallback, useState } from "react";

/**
 * Monte‑Carlo for terminal price S_T using GBM:
 * S_T = S0 * exp((mu - 0.5*sigma^2)T + sigma*sqrt(T)*Z),  Z~N(0,1)
 * Batches the work so UI stays responsive and exposes progress.
 * Returns:
 *  - xs: bin centers
 *  - ys: heights normalized to [0,1] (for drawing)
 *  - pdf: probabilities per bin (sum=1)  <-- new
 *  - band: {q01,q05,q95,q99}
 */
export default function useMonteCarlo() {
  const [xs, setXs] = useState([]);
  const [ys, setYs] = useState([]);
  const [pdf, setPdf] = useState([]); // NEW
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
    }) => {
      if (!(S0 > 0) || !(sigma > 0) || !(T > 0)) {
        setXs([]); setYs([]); setPdf([]); setBand({ q01: null, q05: null, q95: null, q99: null });
        setProgress({ done: 0, total: 0 });
        return;
      }

      const a = (mu - 0.5 * sigma * sigma) * T;
      const b = sigma * Math.sqrt(T);

      const lo = Number.isFinite(minX) ? minX : S0 * 0.6;
      const hi = Number.isFinite(maxX) ? maxX : S0 * 1.4;
      const step = (hi - lo) / bins;

      const counts = new Float64Array(bins);
      const total = n;
      const batch = 20_000;
      let done = 0;

      setProgress({ done, total });

      const boxMuller = () => {
        const u1 = Math.random() || 1e-12;
        const u2 = Math.random();
        return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      };

      while (done < total) {
        const m = Math.min(batch, total - done);
        for (let i = 0; i < m; i++) {
          const z = boxMuller();
          const ST = S0 * Math.exp(a + b * z);
          let idx = Math.floor((ST - lo) / step);
          if (idx < 0) idx = 0;
          else if (idx >= bins) idx = bins - 1;
          counts[idx] += 1;
        }
        done += m;
        setProgress({ done, total });
        await new Promise(requestAnimationFrame);
      }

      const outXs = Array.from({ length: bins }, (_, i) => lo + (i + 0.5) * step);
      const maxCount = Math.max(...counts);
      const outYs = Array.from(counts, (c) => (maxCount > 0 ? c / maxCount : 0));

      // probabilities
      const tot = counts.reduce((acc, v) => acc + v, 0) || 1;
      const outPdf = Array.from(counts, (c) => c / tot);

      // quantiles
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
      setPdf(outPdf); // NEW
      setBand({ q01: qAt(0.01), q05: qAt(0.05), q95: qAt(0.95), q99: qAt(0.99) });
    },
    []
  );

  return { xs, ys, pdf, band, progress, run };
}
