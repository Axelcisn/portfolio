// components/Strategy/mc.worker.js
// Module worker. Load with:
// new Worker(new URL('./mc.worker.js', import.meta.url), { type: 'module' })

// -------- PRNG (xorshift32) + Box–Muller --------
class RNG {
  constructor(seed = 123456789) {
    this.s = (seed >>> 0) || 1;
    // Warm up a little
    for (let i = 0; i < 8; i++) this._u32();
    this._gaussSpare = null;
  }
  _u32() {
    let x = this.s >>> 0;
    x ^= x << 13; x >>>= 0;
    x ^= x << 17; x >>>= 0;
    x ^= x << 5;  x >>>= 0;
    this.s = x >>> 0;
    return this.s;
  }
  // U(0,1)
  rand() { return (this._u32() >>> 0) / 4294967296; }
  // N(0,1) via Box–Muller (polar)
  gauss() {
    if (this._gaussSpare != null) {
      const g = this._gaussSpare; this._gaussSpare = null; return g;
    }
    let u = 0, v = 0, r = 0;
    do {
      u = this.rand() * 2 - 1;
      v = this.rand() * 2 - 1;
      r = u*u + v*v;
    } while (r === 0 || r >= 1);
    const f = Math.sqrt(-2 * Math.log(r) / r);
    this._gaussSpare = v * f;
    return u * f;
  }
}

// -------- Quickselect for percentiles (in place) --------
function swap(a, i, j) { const t = a[i]; a[i] = a[j]; a[j] = t; }

function partition(a, left, right, pivotIdx) {
  const pivotVal = a[pivotIdx];
  swap(a, pivotIdx, right);
  let store = left;
  for (let i = left; i < right; i++) {
    if (a[i] < pivotVal) { swap(a, store, i); store++; }
  }
  swap(a, right, store);
  return store;
}

function nthElement(a, k, left = 0, right = a.length - 1) {
  while (true) {
    if (left === right) return a[left];
    let pivotIdx = left + ((right - left) >> 1);
    pivotIdx = partition(a, left, right, pivotIdx);
    if (k === pivotIdx) return a[k];
    if (k < pivotIdx) right = pivotIdx - 1;
    else left = pivotIdx + 1;
  }
}

function percentile(a, p) {
  const idx = Math.max(0, Math.min(a.length - 1, Math.floor(p * (a.length - 1))));
  // nthElement mutates `a` but is O(n)
  return nthElement(a, idx, 0, a.length - 1);
}

// -------- Core simulation (GBM under risk-neutral drift) --------
function simulate({ spot, sigma, r, T, paths, steps, seed }) {
  const S0 = Number(spot);
  const vol = Math.max(0, Number(sigma));
  const rate = Number.isFinite(r) ? Number(r) : 0;
  const t = Math.max(1e-8, Number(T)); // years
  const nPaths = Math.max(1, Math.floor(paths || 1e6));
  const nSteps = Math.max(1, Math.floor(steps || Math.round(252 * t)));

  const rng = new RNG(seed || 0x9E3779B9); // default non-trivial seed
  const dt = t / nSteps;
  const drift = (rate - 0.5 * vol * vol) * dt;
  const volStep = vol * Math.sqrt(dt);

  const out = new Float64Array(nPaths);
  let mean = 0;

  for (let p = 0; p < nPaths; p++) {
    let S = S0;
    for (let s = 0; s < nSteps; s++) {
      const z = rng.gauss();
      S = S * Math.exp(drift + volStep * z);
    }
    out[p] = S;
    // online mean (Kahan not needed here)
    mean += (S - mean) / (p + 1);
    // (Optional) progress events every ~100k paths
    if ((p & 0x1FFFF) === 0 && p > 0) {
      // postMessage({ type: 'progress', done: p, total: nPaths });
    }
  }

  // Copy before quickselect if you want to preserve ordering elsewhere
  const arr = out; // already Float64Array
  const low  = percentile(arr, 0.025);
  const high = percentile(arr, 0.975);

  return { low, high, mean, count: nPaths };
}

// -------- message handling --------
self.onmessage = (e) => {
  const { cmd, params } = e.data || {};
  if (cmd !== 'run') {
    self.postMessage({ type: 'error', error: 'Unknown command' });
    return;
  }
  try {
    const res = simulate({
      spot: params?.spot,
      sigma: params?.sigma,
      r: params?.r ?? params?.riskFree ?? 0,
      T: params?.T,
      paths: params?.paths ?? 1_000_000,
      steps: params?.steps,
      seed: params?.seed,
    });
    self.postMessage({ type: 'result', ...res });
  } catch (err) {
    self.postMessage({ type: 'error', error: String(err?.message || err) });
  }
};
