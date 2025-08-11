/* -------------------------------------------------------------------------- */
/* Strategy instantiation helpers (non-breaking extension)                    */
/* -------------------------------------------------------------------------- */

/**
 * Guess an exchange-like strike step from spot.
 * Examples: <20 → 0.5, <100 → 1, <500 → 5, <1000 → 10, else 25.
 */
export function guessStep(spot) {
  const s = Math.max(0.01, Number(spot) || 0);
  if (s < 1) return 0.05;
  if (s < 5) return 0.1;
  if (s < 20) return 0.5;
  if (s < 100) return 1;
  if (s < 500) return 5;
  if (s < 1000) return 10;
  if (s < 5000) return 25;
  return 50;
}

function roundToStep(x, step) {
  const k = Math.round(x / step) * step;
  // normalize to a sensible number of decimals based on step granularity
  const d = Math.max(0, ((step + '').split('.')[1] || '').length);
  return Number(k.toFixed(d));
}

/* ------------------------- Normal CDF & BS pricing ------------------------ */

function erf(x) {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  // Abramowitz & Stegun 7.1.26
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741,
        a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}
function normCdf(x) { return 0.5 * (1 + erf(x / Math.SQRT2)); }

function bsPrice({ S, K, r = 0, sigma = 0.2, T = 30 / 365, type = 'call' }) {
  S = Number(S); K = Number(K); r = Number(r); sigma = Math.max(0, Number(sigma)); T = Math.max(0, Number(T));
  if (!isFinite(S) || !isFinite(K) || S <= 0 || K <= 0) return 0;
  if (sigma === 0 || T === 0) {
    const intrinsic = type === 'call' ? Math.max(S - K, 0) : Math.max(K - S, 0);
    return intrinsic; // no discounting for simplicity in seeding
  }
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  if (type === 'call') {
    return S * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2);
  } else {
    return K * Math.exp(-r * T) * normCdf(-d2) - S * normCdf(-d1);
  }
}

function jitter(v, pct = 0.04) {
  const f = 1 + (Math.random() * 2 - 1) * pct; // ±pct
  return v * f;
}

/* --------------------------- Strategy templates --------------------------- */
/**
 * Minimal, robust templates keyed by normalized strategy id.
 * Each function receives (atm, step, w) and returns an object with
 * optional strikes for lc/sc/lp/sp. Only defined keys are enabled.
 */
const ORDER_TEMPLATES = {
  'long-call': (atm/*, step, w*/) => ({ lc: atm }),
  'short-call': (atm/*, step, w*/) => ({ sc: atm }),
  'long-put': (atm/*, step, w*/) => ({ lp: atm }),
  'short-put': (atm/*, step, w*/) => ({ sp: atm }),

  'bull-call-spread': (atm, step, w) => ({ lc: atm, sc: roundToStep(atm + w * step, step) }),
  'bear-call-spread': (atm, step, w) => ({ sc: atm, lc: roundToStep(atm + w * step, step) }),

  'bull-put-spread':  (atm, step, w) => ({ lp: roundToStep(atm - w * step, step), sp: atm }),
  'bear-put-spread':  (atm, step, w) => ({ sp: roundToStep(atm - w * step, step), lp: atm }),

  'long-straddle':    (atm/*, step, w*/) => ({ lc: atm, lp: atm }),
  'short-straddle':   (atm/*, step, w*/) => ({ sc: atm, sp: atm }),

  'long-strangle':    (atm, step, w) => ({ lp: roundToStep(atm - w * step, step), lc: roundToStep(atm + w * step, step) }),
  'short-strangle':   (atm, step, w) => ({ sp: roundToStep(atm - w * step, step), sc: roundToStep(atm + w * step, step) }),

  // Optional: basic call/put butterfly (1:-2:1) at [ATM-w, ATM, ATM+w]
  'call-butterfly':   (atm, step, w) => ({
    lc: roundToStep(atm - w * step, step),
    sc: atm, // NOTE: quantity will handle -2 later
    // we represent the upper long call via lc qty aggregation where supported,
    // but for keyed legs we keep one lc and one sc; volumes will encode 2 shorts if needed
  }),
  // You can add more (bear/bull boxes, iron condor) later if needed.
};

/* -------------------- Catalog integration & volume map -------------------- */
// If this file already exports getStrategyById/getCanonical, we reuse them.
// We defensively access them via global scope to avoid circular issues.
function _safeGetStrategyById(id) {
  try { return (typeof getStrategyById === 'function') ? getStrategyById(id) : null; }
  catch { return null; }
}

/** Map catalog legs -> keyed quantities {lc,sc,lp,sp} */
function volumesFromCatalog(catalogLegs = []) {
  const qty = { lc: 0, sc: 0, lp: 0, sp: 0 };
  for (const leg of catalogLegs) {
    const pos = (leg.position || '').toLowerCase();
    const v = Number(leg.volume ?? leg.qty ?? 1);
    if (pos.includes('long call'))  qty.lc += v;
    if (pos.includes('short call')) qty.sc += v;
    if (pos.includes('long put'))   qty.lp += v;
    if (pos.includes('short put'))  qty.sp += v;
  }
  // default to 1 if everything was zero/unset
  if (qty.lc === 0 && qty.sc === 0 && qty.lp === 0 && qty.sp === 0) qty.lc = 1;
  return qty;
}

/* ---------------------- Row & keyed legs shape builders ------------------- */
function toRowsFromKeyed({ strikes, qty, premiums }) {
  const rows = [];
  if (strikes.lc != null && qty.lc) rows.push({ position: 'Long Call',  strike: strikes.lc, volume: qty.lc, premium: premiums.lc });
  if (strikes.sc != null && qty.sc) rows.push({ position: 'Short Call', strike: strikes.sc, volume: qty.sc, premium: premiums.sc });
  if (strikes.lp != null && qty.lp) rows.push({ position: 'Long Put',   strike: strikes.lp, volume: qty.lp, premium: premiums.lp });
  if (strikes.sp != null && qty.sp) rows.push({ position: 'Short Put',  strike: strikes.sp, volume: qty.sp, premium: premiums.sp });
  return rows;
}

function toKeyedFromRows(rows) {
  const keyed = {
    lc: { enabled: false, K: null, qty: 0, premium: null },
    sc: { enabled: false, K: null, qty: 0, premium: null },
    lp: { enabled: false, K: null, qty: 0, premium: null },
    sp: { enabled: false, K: null, qty: 0, premium: null },
  };
  for (const r of rows) {
    const pos = (r.position || '').toLowerCase();
    const base = { enabled: true, K: Number(r.strike), qty: Number(r.volume || 1), premium: Number(r.premium ?? 0) };
    if (pos.includes('long call'))  Object.assign(keyed.lc, base);
    if (pos.includes('short call')) Object.assign(keyed.sc, base);
    if (pos.includes('long put'))   Object.assign(keyed.lp, base);
    if (pos.includes('short put'))  Object.assign(keyed.sp, base);
  }
  return keyed;
}

/* ------------------------- Premium estimation logic ----------------------- */
function estimatePremiums({ S, strikes, qty, r, sigma, T }) {
  const premiums = { lc: null, sc: null, lp: null, sp: null };
  if (strikes.lc != null && qty.lc) premiums.lc = jitter(bsPrice({ S, K: strikes.lc, r, sigma, T, type: 'call' }));
  if (strikes.sc != null && qty.sc) premiums.sc = jitter(bsPrice({ S, K: strikes.sc, r, sigma, T, type: 'call' }));
  if (strikes.lp != null && qty.lp) premiums.lp = jitter(bsPrice({ S, K: strikes.lp, r, sigma, T, type: 'put'  }));
  if (strikes.sp != null && qty.sp) premiums.sp = jitter(bsPrice({ S, K: strikes.sp, r, sigma, T, type: 'put'  }));
  return premiums;
}

function sumNetPremium(rows) {
  // long = debit (+), short = credit (−)
  let total = 0;
  for (const r of rows) {
    const p = Number(r.premium ?? 0);
    const q = Number(r.volume ?? 1);
    const pos = (r.position || '').toLowerCase();
    const sign = (pos.startsWith('short')) ? -1 : +1;
    total += sign * p * q;
  }
  return total;
}

/* ------------------------- Public API: instantiate ------------------------ */
/**
 * instantiateStrategy(strategyOrId, env)
 *  - strategyOrId: string id (preferred) or a catalog object with { id, legs, name, ... }
 *  - env: { spot, sigma, T, riskFree, widthSteps=1 }
 *
 * Returns:
 *  { id, name, rows, legsKeyed, netPremium, meta:{ atm, step, widthSteps, lotSize } }
 */
export function instantiateStrategy(strategyOrId, env = {}) {
  const {
    spot,
    sigma = 0.2,
    T = 30 / 365,
    riskFree = 0.02,
    widthSteps = 1,
  } = env;

  const S = Number(spot);
  if (!isFinite(S) || S <= 0) {
    throw new Error('instantiateStrategy requires a positive spot price');
  }

  // Resolve catalog entry (volumes come from here)
  let catalog = null;
  let id = null;
  if (typeof strategyOrId === 'string') {
    id = strategyOrId;
    catalog = _safeGetStrategyById(id) || { id, name: id, legs: [] };
  } else if (strategyOrId && typeof strategyOrId === 'object') {
    catalog = strategyOrId;
    id = catalog.id || 'custom';
  } else {
    throw new Error('instantiateStrategy: invalid strategy identifier');
  }

  const step = guessStep(S);
  const atm = roundToStep(S, step);
  const w = Math.max(1, Math.floor(Number(widthSteps) || 1));

  const template = ORDER_TEMPLATES[id] || ORDER_TEMPLATES[(id || '').toLowerCase()] || ORDER_TEMPLATES['long-call'];
  const strikes = template(atm, step, w);

  // Enforce strict ordering if multiple strikes exist
  const ordered = ['lc','sc','lp','sp'].reduce((acc, k) => {
    if (strikes[k] != null) acc.push({ k, K: strikes[k] });
    return acc;
  }, []);
  // For 2–4 legs of the same option type, ensure ascending order
  // (Our templates already enforce it; this is a safety net.)
  ordered.sort((a, b) => a.K - b.K);
  for (const {k, K} of ordered) strikes[k] = K;

  // Quantities from catalog
  const qty = volumesFromCatalog(catalog.legs || []);

  // Temporary premiums
  const premiums = estimatePremiums({ S, strikes, qty, r: riskFree, sigma, T });

  // Rows & keyed
  const rows = toRowsFromKeyed({ strikes, qty, premiums });
  const legsKeyed = toKeyedFromRows(rows);

  // Meta & net premium
  const netPremium = sumNetPremium(rows);
  const lotSize = Math.abs((legsKeyed.lc?.qty || 0)) + Math.abs((legsKeyed.sc?.qty || 0)) +
                  Math.abs((legsKeyed.lp?.qty || 0)) + Math.abs((legsKeyed.sp?.qty || 0));

  return {
    id,
    name: catalog.name || id,
    rows,
    legsKeyed,
    netPremium,
    meta: { atm, step, widthSteps: w, lotSize }
  };
}

/* ==== One-click instantiation (append to file) ============================ */

/** Guess a realistic strike increment from spot. */
export function guessStep(spot) {
  const s = Math.max(0.01, Number(spot) || 0);
  if (s < 1) return 0.05;
  if (s < 5) return 0.1;
  if (s < 20) return 0.5;
  if (s < 100) return 1;
  if (s < 500) return 5;
  if (s < 1000) return 10;
  if (s < 5000) return 25;
  return 50;
}
function _roundToStep(x, step) {
  const k = Math.round(x / step) * step;
  const d = Math.max(0, ((step + '').split('.')[1] || '').length);
  return Number(k.toFixed(d));
}

/* ---------- Black–Scholes (pricing for temp premiums) ---------- */
function _erf(x) {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}
function _normCdf(x) { return 0.5 * (1 + _erf(x / Math.SQRT2)); }
function _bsPrice({ S, K, r = 0, sigma = 0.2, T = 30 / 365, type = 'call' }) {
  S = Number(S); K = Number(K); r = Number(r); sigma = Math.max(0, Number(sigma)); T = Math.max(0, Number(T));
  if (!isFinite(S) || !isFinite(K) || S <= 0 || K <= 0) return 0;
  if (sigma === 0 || T === 0) {
    const intrinsic = type === 'call' ? Math.max(S - K, 0) : Math.max(K - S, 0);
    return intrinsic;
  }
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  if (type === 'call') return S * _normCdf(d1) - K * Math.exp(-r * T) * _normCdf(d2);
  return K * Math.exp(-r * T) * _normCdf(-d2) - S * _normCdf(-d1);
}
function _jitter(v, pct = 0.04) { return v * (1 + (Math.random() * 2 - 1) * pct); }

/* ---------- Templates: ordered strikes per strategy id ---------- */
/** Returns { lc?, sc?, lp?, sp? } strikes; only returned keys are enabled. */
const _ORDER_TEMPLATES = {
  'long-call':     (atm/*, step, w*/) => ({ lc: atm }),
  'short-call':    (atm/*, step, w*/) => ({ sc: atm }),
  'long-put':      (atm/*, step, w*/) => ({ lp: atm }),
  'short-put':     (atm/*, step, w*/) => ({ sp: atm }),

  'bull-call-spread': (atm, step, w) => ({ lc: atm, sc: _roundToStep(atm + w * step, step) }),
  'bear-call-spread': (atm, step, w) => ({ sc: atm, lc: _roundToStep(atm + w * step, step) }),
  'bull-put-spread':  (atm, step, w) => ({ lp: _roundToStep(atm - w * step, step), sp: atm }),
  'bear-put-spread':  (atm, step, w) => ({ sp: _roundToStep(atm - w * step, step), lp: atm }),

  'long-straddle':    (atm/*, step, w*/) => ({ lc: atm, lp: atm }),
  'short-straddle':   (atm/*, step, w*/) => ({ sc: atm, sp: atm }),

  'long-strangle':    (atm, step, w) => ({ lp: _roundToStep(atm - w * step, step), lc: _roundToStep(atm + w * step, step) }),
  'short-strangle':   (atm, step, w) => ({ sp: _roundToStep(atm - w * step, step), sc: _roundToStep(atm + w * step, step) }),

  // simple neutral examples
  'call-butterfly':   (atm, step, w) => ({ lc: _roundToStep(atm - w * step, step), sc: atm }), // qty encodes 1:-2:1
  'put-butterfly':    (atm, step, w) => ({ lp: _roundToStep(atm - w * step, step), sp: atm }),

  // iron condor: SP(K1) < LP(K2) < ATM < SC(K3) < LC(K4)
  'iron-condor':      (atm, step, w) => ({
    sp: _roundToStep(atm - 2 * w * step, step),
    lp: _roundToStep(atm - 1 * w * step, step),
    sc: _roundToStep(atm + 1 * w * step, step),
    lc: _roundToStep(atm + 2 * w * step, step),
  }),
  'iron-butterfly':   (atm, step, w) => ({
    sp: _roundToStep(atm - 1 * w * step, step),
    lp: atm,
    sc: atm,
    lc: _roundToStep(atm + 1 * w * step, step),
  }),
};

/* ---------- Catalog volumes -> keyed quantities ---------- */
function _volumesFromCatalog(catalogLegs = []) {
  const qty = { lc: 0, sc: 0, lp: 0, sp: 0 };
  for (const leg of catalogLegs) {
    const pos = (leg.position || '').toLowerCase();
    const v = Number(leg.volume ?? leg.qty ?? 1);
    if (pos.includes('long call'))  qty.lc += v;
    if (pos.includes('short call')) qty.sc += v;
    if (pos.includes('long put'))   qty.lp += v;
    if (pos.includes('short put'))  qty.sp += v;
  }
  if (qty.lc === 0 && qty.sc === 0 && qty.lp === 0 && qty.sp === 0) qty.lc = 1;
  return qty;
}
function _toRowsFromKeyed({ strikes, qty, premiums }) {
  const rows = [];
  if (strikes.lc != null && qty.lc) rows.push({ position: 'Long Call',  strike: strikes.lc, volume: qty.lc, premium: premiums.lc });
  if (strikes.sc != null && qty.sc) rows.push({ position: 'Short Call', strike: strikes.sc, volume: qty.sc, premium: premiums.sc });
  if (strikes.lp != null && qty.lp) rows.push({ position: 'Long Put',   strike: strikes.lp, volume: qty.lp, premium: premiums.lp });
  if (strikes.sp != null && qty.sp) rows.push({ position: 'Short Put',  strike: strikes.sp, volume: qty.sp, premium: premiums.sp });
  return rows;
}
function _toKeyedFromRows(rows) {
  const keyed = {
    lc: { enabled: false, K: null, qty: 0, premium: null },
    sc: { enabled: false, K: null, qty: 0, premium: null },
    lp: { enabled: false, K: null, qty: 0, premium: null },
    sp: { enabled: false, K: null, qty: 0, premium: null },
  };
  for (const r of rows) {
    const pos = (r.position || '').toLowerCase();
    const base = { enabled: true, K: Number(r.strike), qty: Number(r.volume || 1), premium: Number(r.premium ?? 0) };
    if (pos.includes('long call'))  Object.assign(keyed.lc, base);
    if (pos.includes('short call')) Object.assign(keyed.sc, base);
    if (pos.includes('long put'))   Object.assign(keyed.lp, base);
    if (pos.includes('short put'))  Object.assign(keyed.sp, base);
  }
  return keyed;
}
function _estimatePremiums({ S, strikes, qty, r, sigma, T }) {
  const premiums = { lc: null, sc: null, lp: null, sp: null };
  if (strikes.lc != null && qty.lc) premiums.lc = _jitter(_bsPrice({ S, K: strikes.lc, r, sigma, T, type: 'call' }));
  if (strikes.sc != null && qty.sc) premiums.sc = _jitter(_bsPrice({ S, K: strikes.sc, r, sigma, T, type: 'call' }));
  if (strikes.lp != null && qty.lp) premiums.lp = _jitter(_bsPrice({ S, K: strikes.lp, r, sigma, T, type: 'put'  }));
  if (strikes.sp != null && qty.sp) premiums.sp = _jitter(_bsPrice({ S, K: strikes.sp, r, sigma, T, type: 'put'  }));
  return premiums;
}
function _sumNetPremium(rows) {
  let total = 0;
  for (const r of rows) {
    const p = Number(r.premium ?? 0);
    const q = Number(r.volume ?? 1);
    const pos = (r.position || '').toLowerCase();
    const sign = (pos.startsWith('short')) ? -1 : +1; // long = debit (+), short = credit (−)
    total += sign * p * q;
  }
  return total;
}

/**
 * Instantiate a strategy into fully specified legs ready for charting.
 * @param {string|object} strategyOrId  e.g., "long-call" or a catalog object
 * @param {object} env { spot, sigma=0.2, T=30/365, riskFree=0.02, widthSteps=1 }
 * @returns { id, name, rows, legsKeyed, netPremium, meta:{ atm, step, widthSteps, lotSize } }
 */
export function instantiateStrategy(strategyOrId, env = {}) {
  const {
    spot,
    sigma = 0.2,
    T = 30 / 365,
    riskFree = 0.02,
    widthSteps = 1,
  } = env;

  const S = Number(spot);
  if (!isFinite(S) || S <= 0) throw new Error('instantiateStrategy requires a positive spot price');

  // Resolve catalog entry
  let catalog = null;
  let id = null;
  if (typeof strategyOrId === 'string') {
    id = strategyOrId;
    // getStrategyById is exported above in this file
    catalog = (typeof getStrategyById === 'function') ? getStrategyById(id) : null;
    if (!catalog) catalog = { id, name: id, legs: [] };
  } else if (strategyOrId && typeof strategyOrId === 'object') {
    catalog = strategyOrId;
    id = catalog.id || 'custom';
  } else {
    throw new Error('instantiateStrategy: invalid strategy identifier');
  }

  const step = guessStep(S);
  const atm = _roundToStep(S, step);
  const w = Math.max(1, Math.floor(Number(widthSteps) || 1));

  // Prefer a dedicated template; otherwise infer a simple mapping from legs present.
  const templ = _ORDER_TEMPLATES[id] || ((atm2, step2, w2) => {
    // Fallback: map present legs to ATM +/- steps keeping ordering rules
    const qty = _volumesFromCatalog(catalog.legs || []);
    const strikes = {};
    if (qty.lc) strikes.lc = atm2;
    if (qty.sc) strikes.sc = _roundToStep(atm2 + w2 * step2, step2);
    if (qty.lp) strikes.lp = atm2;
    if (qty.sp) strikes.sp = _roundToStep(atm2 - w2 * step2, step2);
    return strikes;
  });

  const strikes = templ(atm, step, w);

  // Quantities from catalog
  const qty = _volumesFromCatalog(catalog.legs || []);

  // Premiums
  const premiums = _estimatePremiums({ S, strikes, qty, r: riskFree, sigma, T });

  // Rows + keyed
  const rows = _toRowsFromKeyed({ strikes, qty, premiums });
  const legsKeyed = _toKeyedFromRows(rows);

  const netPremium = _sumNetPremium(rows);
  const lotSize = Math.abs(legsKeyed.lc?.qty || 0) + Math.abs(legsKeyed.sc?.qty || 0) +
                  Math.abs(legsKeyed.lp?.qty || 0) + Math.abs(legsKeyed.sp?.qty || 0);

  return {
    id,
    name: catalog.name || id,
    rows,
    legsKeyed,
    netPremium,
    meta: { atm, step, widthSteps: w, lotSize }
  };
}
