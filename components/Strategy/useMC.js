// components/Strategy/useMC.js
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Safe worker factory (browser only)
function makeWorker() {
  return new Worker(new URL('./mc.worker.js', import.meta.url), { type: 'module' });
}

/**
 * useMC — run 1,000,000-path GBM Monte-Carlo in a Web Worker.
 * Params: { spot, sigma, r, T, paths=1_000_000, steps, seed }
 */
export function useMC() {
  const wref = useRef(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const terminate = useCallback(() => {
    try { wref.current?.terminate(); } catch {}
    wref.current = null;
  }, []);

  const run = useCallback((params) => {
    if (typeof window === 'undefined') return Promise.resolve(null);
    terminate();

    const w = makeWorker();
    wref.current = w;
    setLoading(true);
    setError(null);
    setResult(null);

    return new Promise((resolve, reject) => {
      w.onmessage = (e) => {
        const d = e.data || {};
        if (d.type === 'result') {
          setResult({ low: d.low, high: d.high, mean: d.mean, count: d.count });
          setLoading(false);
          resolve(d);
          terminate();
        } else if (d.type === 'error') {
          const err = new Error(d.error || 'Monte-Carlo error');
          setError(err);
          setLoading(false);
          reject(err);
          terminate();
        }
      };
      w.onerror = (err) => {
        const e = new Error(err?.message || 'Worker error');
        setError(e);
        setLoading(false);
        reject(e);
        terminate();
      };

      // Sensible defaults for steps if none provided
      const T = Math.max(1e-8, Number(params?.T || 0));
      const steps = params?.steps ?? Math.max(16, Math.round(64 * T)); // ~64 steps / year
      w.postMessage({
        cmd: 'run',
        params: {
          ...params,
          steps,
          paths: params?.paths ?? 1_000_000,
          seed: params?.seed ?? (Date.now() & 0xffffffff),
        },
      });
    });
  }, [terminate]);

  const reset = useCallback(() => {
    terminate();
    setResult(null);
    setLoading(false);
    setError(null);
  }, [terminate]);

  useEffect(() => terminate, [terminate]);

  return { result, loading, error, run, reset };
}
