// app/api/capm/route.js
// Runtime: Node.js (Vercel). Clean CAPM drift service.
// All rates are decimals per year in the requested basis.
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────
// Formulas (LaTeX, for reference)
// • Equity risk premium: \mathrm{ERP} = E(R_m) - r_f
// • CAPM drift: \mu = r_f + \beta \cdot \mathrm{ERP} - q
// • Compounding:
//   r_{\text{cont}} = \ln(1 + r_{\text{annual}})
//   r_{\text{annual}} = e^{r_{\text{cont}}} - 1
// ─────────────────────────────────────────────────────────────

function isNum(x) { return typeof x === 'number' && Number.isFinite(x); }
function num(v) {
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : NaN;
}
function bad(msg) {
  return NextResponse.json({ error: 'bad_request', message: msg }, { status: 400 });
}

function toCont(rAnnual) { return Math.log(1 + Number(rAnnual)); }
function toAnnual(rCont) { return Math.exp(Number(rCont)) - 1; }

/**
 * Compute CAPM drift in the same basis as inputs.
 * Inputs:
 *  - basis: 'annual' | 'cont'  (default 'annual')
 *  - beta, riskFree, (mrp or indexAnn), q?
 * Returns { mu, inputs, meta }
 */
function computeMu({ basis = 'annual', beta, riskFree, mrp, indexAnn, q = 0 }) {
  const b = (basis || 'annual').toLowerCase() === 'cont' ? 'cont' : 'annual';
  const β = num(beta);
  const r_f = num(riskFree);
  const qd = num(q);
  const hasMrp = mrp != null;
  const hasIndex = indexAnn != null;

  if (!isNum(β)) throw new Error('beta must be a finite number');
  if (!isNum(r_f)) throw new Error('riskFree must be a finite number');
  if (!isNum(qd)) throw new Error('q must be a finite number (use 0 if unknown)');
  if (!hasMrp && !hasIndex) throw new Error('provide either mrp or indexAnn');

  const ERP = hasMrp ? num(mrp) : (num(indexAnn) - r_f);
  if (!isNum(ERP)) throw new Error('mrp/indexAnn must be finite numbers and consistent with basis');

  // CAPM drift (same basis as inputs)
  const mu = r_f + β * ERP - qd;

  return {
    mu,
    inputs: { basis: b, beta: β, riskFree: r_f, mrp: ERP, q: qd },
    meta: {
      formula: 'mu = r_f + beta * (E[R_m] - r_f) - q',
      asOf: new Date().toISOString(),
    },
  };
}

// Accept POST with JSON body; GET with query params for convenience.
export async function POST(req) {
  try {
    const body = await req.json();
    const basis = (body?.basis || 'annual').toLowerCase();
    const result = computeMu({
      basis,
      beta: body?.beta,
      riskFree: body?.riskFree,
      mrp: body?.mrp,
      indexAnn: body?.indexAnn,
      q: body?.q ?? 0,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return bad(err?.message || 'invalid payload');
  }
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const basis = (searchParams.get('basis') || 'annual').toLowerCase();
    const result = computeMu({
      basis,
      beta: searchParams.get('beta'),
      riskFree: searchParams.get('riskFree'),
      mrp: searchParams.get('mrp'),
      indexAnn: searchParams.get('indexAnn'),
      q: searchParams.get('q') ?? 0,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return bad(err?.message || 'invalid query');
  }
}
