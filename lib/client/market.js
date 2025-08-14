// lib/client/market.js
// Minimal client helper to fetch market stats with currency passthrough.
// Ready for use in components (e.g., MarketCard) without changing layout.
//
// Formulas (LaTeX, reference):
// • \mathrm{ERP} = E(R_m) - r_f
// • \mu_{\text{geom}} = \bar{r}_\Delta \cdot 252 \quad;\quad \mu_{\text{arith}} = \overline{R_\Delta} \cdot 252
// • \sigma = s_{r_\Delta} \cdot \sqrt{252}
// • r_{\text{cont}} = \ln(1 + r_{\text{annual}}) \quad;\quad r_{\text{annual}} = e^{r_{\text{cont}}} - 1

/**
 * Build a query string from a plain object (skips null/undefined/"").
 * @param {Record<string, string|number|null|undefined>} params
 */
function qs(params) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v === null || v === undefined || v === '') continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/**
 * Fetch market stats with currency passthrough.
 * All rates returned are decimals per year; basis echoed from server.
 *
 * @param {Object} opts
 * @param {string} [opts.index="^GSPC"]   - Yahoo symbol or alias (SPX,^GSPC,STOXX,^SX5E,...)
 * @param {string} [opts.lookback="5y"]   - 3m|6m|1y|3y|5y|10y|ytd
 * @param {string} [opts.basis="annual"]  - "annual" | "cont"
 * @param {string} [opts.currency]        - Optional override (USD, EUR, GBP, JPY, CHF, CAD)
 * @returns {Promise<{
 *   index: string,
 *   currency: string,
 *   basis: "annual"|"cont",
 *   stats: { mu_geom: number, mu_arith: number, sigma: number, n: number },
 *   riskFree: { r: number, asOf: string, source: string },
 *   mrp: number,
 *   meta: {
 *     window: string, startDate: string|null, endDate: string|null,
 *     periodsPerYear: number, cacheTTL: number, note: string
 *   }
 * }>}
 */
export async function getMarketStats({
  index = '^GSPC',
  lookback = '5y',
  basis = 'annual',
  currency,
} = {}) {
  const url = `/api/market/stats${qs({ index, lookback, basis, currency })}`;
  const res = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GET ${url} failed (${res.status}) ${text}`);
  }
  const json = await res.json();
  // Sanity: required keys
  if (!json || !json.stats || typeof json.mrp !== 'number') {
    throw new Error('Invalid market stats payload');
  }
  return json;
}

/**
 * Convenience: compute equity risk premium locally when needed.
 * Uses server's geometric mean by default.
 * \mathrm{ERP} = E(R_m) - r_f
 */
export function computeErpLocal(muGeomAnnual, rAnnual) {
  const m = Number(muGeomAnnual);
  const r = Number(rAnnual);
  if (!Number.isFinite(m) || !Number.isFinite(r)) return NaN;
  return m - r;
}

/**
 * Basis conversions (keep in sync with server).
 * r_{\text{cont}} = \ln(1 + r_{\text{annual}}) \quad;\quad r_{\text{annual}} = e^{r_{\text{cont}}} - 1
 */
export function toCont(rAnnual) { return Math.log(1 + Number(rAnnual)); }
export function toAnnual(rCont) { return Math.exp(Number(rCont)) - 1; }
