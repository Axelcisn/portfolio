import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cacheHeaders = { "Cache-Control": "no-store" };

function err(status, code, message) {
  // Back-compat: plain string `error`, plus structured `errorObj`
  return NextResponse.json(
    { ok: false, error: message, errorObj: { code, message } },
    { status, headers: cacheHeaders }
  );
}

const toNum = (x) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};
const clampInt = (x, lo, hi) => {
  const n = Math.floor(Number(x) || 0);
  return Math.min(Math.max(n, lo), hi);
};

export async function POST(req) {
  const t0 = Date.now();
  try {
    const body = await req.json();

    const spot = toNum(body?.spot);
    const Tdays = toNum(body?.Tdays);

    if (!(spot > 0) || !(Tdays > 0)) {
      return err(400, "BAD_INPUT", "spot>0 and Tdays>0 required");
    }

    const mu = toNum(body?.mu) ?? 0;
    const sigma = Math.max(0, toNum(body?.sigma) ?? 0);
    const paths = clampInt(body?.paths ?? 20000, 1000, 200000);

    const legs = body?.legs || {};
    const netPremium = toNum(body?.netPremium) ?? 0;
    const carryPremium = !!body?.carryPremium;
    const riskFree = toNum(body?.riskFree) ?? 0;

    const T = Tdays / 365;
    const carry = carryPremium ? Math.exp(riskFree * T) : 1;

    // --- Monte Carlo ---
    const R = Math.min(paths, 20000);
    const reservoir = new Float64Array(R);
    let resCount = 0;

    let meanST = 0;
    let m2ST = 0;

    let win = 0;
    let sumEV = 0;
    const denom = Math.abs(netPremium) > 1e-12 ? Math.abs(netPremium) : spot;

    for (let i = 0; i < paths; i++) {
      const z = boxMuller(Math.random);
      const ST =
        spot *
        Math.exp((mu - 0.5 * sigma * sigma) * T + sigma * Math.sqrt(T) * z);

      // streaming mean/variance (variance not returned but preserved for parity)
      const delta = ST - meanST;
      meanST += delta / (i + 1);
      m2ST += delta * (ST - meanST);

      // reservoir sampling for quantiles
      if (resCount < R) {
        reservoir[resCount++] = ST;
      } else {
        const j = Math.floor(Math.random() * (i + 1));
        if (j < R) reservoir[j] = ST;
      }

      const payoff = payoffAt(ST, legs) - carry * netPremium;
      if (payoff > 0) win += 1;
      sumEV += payoff;

      if ((i + 1) % 5000 === 0) {
        // yield to event loop to avoid blocking
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    // quantiles (on ST) via index rounding, matching existing behavior
    let q05ST = null,
      q25ST = null,
      q50ST = null,
      q75ST = null,
      q95ST = null,
      qLoST = null,
      qHiST = null;

    if (resCount > 0) {
      const arr = Array.from(reservoir.slice(0, resCount)).sort((a, b) => a - b);
      const at = (p) =>
        arr[Math.min(arr.length - 1, Math.max(0, Math.round((arr.length - 1) * p)))];
      q05ST = at(0.05);
      q25ST = at(0.25);
      q50ST = at(0.5);
      q75ST = at(0.75);
      q95ST = at(0.95);
      qLoST = at(0.025);
      qHiST = at(0.975);
    }

    const n = paths;
    const pWin = n ? win / n : null;
    const evAbs = n ? sumEV / n : null;
    const evPct = evAbs != null ? evAbs / denom : null;

    const data = {
      meanST,
      q05ST,
      q25ST,
      q50ST,
      q75ST,
      q95ST,
      qLoST,
      qHiST,
      pWin,
      evAbs,
      evPct,
    };

    // Back-compat: also expose top-level fields
    return NextResponse.json(
      { ok: true, data, ...data, _ms: Date.now() - t0 },
      { status: 200, headers: cacheHeaders }
    );
  } catch (e) {
    return err(500, "INTERNAL_ERROR", String(e?.message ?? e));
  }
}

/* -------- helpers -------- */
function payoffAt(ST, legs) {
  let p = 0;

  const lc = legs?.lc || {};
  if (lc.enabled && Number.isFinite(lc.K) && Number.isFinite(+lc.qty)) {
    p += Math.max(ST - Number(lc.K), 0) * (+lc.qty || 0);
  }

  const sc = legs?.sc || {};
  if (sc.enabled && Number.isFinite(sc.K) && Number.isFinite(+sc.qty)) {
    p -= Math.max(ST - Number(sc.K), 0) * (+sc.qty || 0);
  }

  const lp = legs?.lp || {};
  if (lp.enabled && Number.isFinite(lp.K) && Number.isFinite(+lp.qty)) {
    p += Math.max(Number(lp.K) - ST, 0) * (+lp.qty || 0);
  }

  const sp = legs?.sp || {};
  if (sp.enabled && Number.isFinite(sp.K) && Number.isFinite(+sp.qty)) {
    p -= Math.max(Number(sp.K) - ST, 0) * (+sp.qty || 0);
  }

  return p;
}

function boxMuller(rand) {
  let u = 0,
    v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}
