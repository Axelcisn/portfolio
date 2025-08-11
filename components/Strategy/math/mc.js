// components/Strategy/math/mc.js

// ---- PRNG (deterministic) ----
function mulberry32(seed = 0x9e3779b9) {
  let a = seed >>> 0;
  return function rand() {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- Box–Muller -> two N(0,1) ----
function normals(rand) {
  let u1 = rand();
  let u2 = rand();
  // avoid log(0)
  if (u1 <= 1e-12) u1 = 1e-12;
  const r = Math.sqrt(-2 * Math.log(u1));
  const th = 2 * Math.PI * u2;
  return [r * Math.cos(th), r * Math.sin(th)];
}

// ---- Quickselect (kth, in-place) ----
function partition(a, left, right, pivotIndex) {
  const pivotValue = a[pivotIndex];
  [a[pivotIndex], a[right]] = [a[right], a[pivotIndex]];
  let store = left;
  for (let i = left; i < right; i++) {
    if (a[i] < pivotValue) {
      [a[i], a[store]] = [a[store], a[i]];
      store++;
    }
  }
  [a[store], a[right]] = [a[right], a[store]];
  return store;
}
function quickselect(a, k, left = 0, right = a.length - 1) {
  while (true) {
    if (left === right) return a[left];
    let pivotIndex = (left + right) >>> 1;
    pivotIndex = partition(a, left, right, pivotIndex);
    if (k === pivotIndex) return a[k];
    if (k < pivotIndex) right = pivotIndex - 1;
    else left = pivotIndex + 1;
  }
}

/**
 * Monte-Carlo stats for terminal price S_T.
 * @param {number} S0  current price
 * @param {number} r   risk free (annualized)
 * @param {number} sigma annual vol
 * @param {number} T   years to expiry
 * @param {number} nPaths default 1,000,000
 * @param {number} seed  optional seed
 * @returns {{lo:number, hi:number, mean:number, n:number}}
 */
export function mcPriceStats(S0, r = 0, sigma = 0.2, T = 30 / 365, nPaths = 1_000_000, seed = 123456789) {
  const S = Number(S0);
  const vol = Math.max(0, Number(sigma));
  const t = Math.max(0, Number(T));
  const n = Math.max(1, nPaths | 0);
  if (!isFinite(S) || S <= 0 || !isFinite(vol) || !isFinite(t)) {
    return { lo: NaN, hi: NaN, mean: NaN, n: 0 };
  }

  const rand = mulberry32(seed >>> 0);
  const arr = new Float64Array(n);

  const driftExp = Math.exp((r - 0.5 * vol * vol) * t);
  const diff = vol * Math.sqrt(t);
  const base = S * driftExp;

  let i = 0;
  let sum = 0;

  while (i < n) {
    const [z1, z2] = normals(rand);

    const st1 = base * Math.exp(diff * z1);
    arr[i++] = st1;
    sum += st1;

    if (i < n) {
      const st2 = base * Math.exp(diff * z2);
      arr[i++] = st2;
      sum += st2;
    }
  }

  const kLo = Math.floor(0.025 * (n - 1));
  const kHi = Math.floor(0.975 * (n - 1));
  const lo = quickselect(arr, kLo);
  const hi = quickselect(arr, kHi);
  const mean = sum / n;

  return { lo, hi, mean, n };
}
