// app/api/diagnostics/basis/route.js
// Runtime: Node.js (Vercel). Basis/units consistency diagnostics.
// Verifies two identities across our APIs:
//
// (1) Compounding conversions:
//     r_cont ?= ln(1 + r_annual)      and      r_annual ?= e^{r_cont} - 1
//
// (2) Equity Risk Premium identity:
//     ERP ?= μ_geom(annual) - r_f(annual)
//
// All rates are decimals per year.

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EPS = 1e-8;        // numeric tolerance for identities
const CCYS = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD'];
const INDICES = [
  { index: 'SPX', currency: 'USD', lookback: '1y' },
  { index: 'STOXX', currency: 'EUR', lookback: '1y' },
];

/** Build absolute URL to internal routes using the incoming request as base. */
function makeUrl(req, path, params = {}) {
  const u = new URL(path, req.url);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
  }
  return u.toString();
}

async function getJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${url} :: ${text.slice(0, 160)}`);
  }
  return res.json();
}

function checkCompounding(annual, cont, eps = EPS) {
  const left = Math.log(1 + Number(annual));
  const right = Math.exp(Number(cont)) - 1;
  const d1 = Number(cont) - left;      // r_cont - ln(1+r_annual)
  const d2 = Number(annual) - right;   // r_annual - (e^{r_cont}-1)
  const ok1 = Math.abs(d1) <= eps;
  const ok2 = Math.abs(d2) <= eps;
  return { ok: ok1 && ok2, deltas: { cont_vs_ln: d1, annual_vs_exp: d2 } };
}

export async function GET(req) {
  try {
    // ─────────────────────────────────────────────────────────
    // (A) Risk-free basis conversions across currencies
    //     r_cont ?= ln(1 + r_annual) and r_annual ?= e^{r_cont} - 1
    // ─────────────────────────────────────────────────────────
    const rfChecks = await Promise.all(
      CCYS.map(async (ccy) => {
        try {
          const urlA = makeUrl(req, '/api/riskfree', { ccy, basis: 'annual' });
          const urlC = makeUrl(req, '/api/riskfree', { ccy, basis: 'cont' });
          const [a, c] = await Promise.all([getJson(urlA), getJson(urlC)]);
          const rAnnual = a?.r;
          const rCont = c?.r;
          if (typeof rAnnual !== 'number' || typeof rCont !== 'number') {
            return { ccy, ok: false, error: 'missing r in response', rAnnual, rCont };
          }
          const chk = checkCompounding(rAnnual, rCont, EPS);
          return {
            ccy,
            ok: chk.ok,
            rAnnual,
            rCont,
            deltas: chk.deltas,
            asOfAnnual: a?.asOf,
            asOfCont: c?.asOf,
            sources: { annual: a?.source, cont: c?.source },
            fallback: { annual: !!a?.meta?.fallback, cont: !!c?.meta?.fallback },
          };
        } catch (e) {
          return { ccy, ok: false, error: String(e) };
        }
      })
    );

    // ─────────────────────────────────────────────────────────
    // (B) ERP identity on market stats
    //     ERP ?= μ_geom(annual) - r_f(annual)
    // ─────────────────────────────────────────────────────────
    const erpChecks = await Promise.all(
      INDICES.map(async ({ index, currency, lookback }) => {
        try {
          const url = makeUrl(req, '/api/market/stats', {
            index,
            currency,
            lookback,
            basis: 'annual', // ensure riskFree.r is annual to match identity
          });
          const m = await getJson(url);
          const mu = m?.stats?.mu_geom;
          const r = m?.riskFree?.r;
          const mrp = m?.mrp;
          if ([mu, r, mrp].some((x) => typeof x !== 'number')) {
            return { index, currency, lookback, ok: false, error: 'missing fields', mu, r, mrp };
          }
          const lhs = mrp;
          const rhs = mu - r;
          const delta = lhs - rhs;
          const ok = Math.abs(delta) <= Math.max(EPS, Math.abs(rhs) * 1e-12);
          return {
            index,
            currency,
            lookback,
            ok,
            delta,
            components: { mu_geom: mu, r_annual: r, mrp_reported: mrp },
            meta: m?.meta,
          };
        } catch (e) {
          return { index, currency, lookback, ok: false, error: String(e) };
        }
      })
    );

    // Aggregate OK
    const allOk =
      rfChecks.every((x) => x.ok) &&
      erpChecks.every((x) => x.ok);

    const payload = {
      ok: allOk,
      epsilon: EPS,
      checks: {
        riskfree_compounding: rfChecks,
        erp_identity: erpChecks,
      },
      meta: {
        asOf: new Date().toISOString(),
        note:
          'Compounding: r_cont ≈ ln(1+r_annual); ERP: mrp ≈ mu_geom(annual) - r_f(annual).',
      },
    };

    return NextResponse.json(payload, {
      status: allOk ? 200 : 207, // 207 Multi-Status-like when some tests fail
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'unexpected_error', message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
