import { NextResponse } from "next/server";

export const runtime = "nodejs";

function boxMuller() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function payoffAt(ST, legs) {
  const call = (K, q, sgn) => Math.max(ST - K, 0) * q * sgn;
  const put  = (K, q, sgn) => Math.max(K - ST, 0) * q * sgn;
  let p = 0;
  const L = legs || {};
  if (L.lc?.enabled) p += call(+L.lc.K, +L.lc.qty, +1);
  if (L.sc?.enabled) p += call(+L.sc.K, +L.sc.qty, -1);
  if (L.lp?.enabled) p += put(+L.lp.K, +L.lp.qty, +1);
  if (L.sp?.enabled) p += put(+L.sp.K, +L.sp.qty, -1);
  return p;
}

export async function POST(req) {
  const body = await req.json();
  const {
    spot,
    mu = 0,
    sigma = 0,
    Tdays,
    paths = 20000,
    legs = {},
    netPremium = 0,
    carryPremium = false,
    riskFree = 0
  } = body || {};

  if (!(spot > 0) || !(Tdays > 0)) {
    return NextResponse.json({ error: "spot>0 and Tdays>0 required" }, { status: 400 });
  }

  const T = Tdays / 365;
  const sT = Math.sqrt(T);
  const carry  = carryPremium ? Math.exp((riskFree || 0) * T) : 1;
  const denom  = Math.abs(netPremium) > 1e-9 ? Math.abs(netPremium) : spot;

  let n = 0, meanST = 0, m2 = 0, evAbs = 0, win = 0;
  const R = Math.min(20000, paths);
  const reservoir = new Float64Array(R);

  for (let i = 0; i < paths; i++) {
    const z  = boxMuller();
    const ST = spot * Math.exp((mu - 0.5 * sigma * sigma) * T + sigma * sT * z);

    n++;
    const delta = ST - meanST;
    meanST += delta / n;
    m2    += delta * (ST - meanST);

    const payoff = payoffAt(ST, legs) - carry * netPremium;
    evAbs += payoff;
    if (payoff > 0) win++;

    if (i < R) {
      reservoir[i] = ST;
    } else {
      const j = Math.floor(Math.random() * (i + 1));
      if (j < R) reservoir[j] = ST;
    }

    if ((i + 1) % 5000 === 0) await new Promise(r => setTimeout(r, 0));
  }

  const arr = Array.from(reservoir.slice(0, Math.min(R, n))).sort((a, b) => a - b);
  const q = (p) => {
    if (!arr.length) return null;
    const idx = Math.max(0, Math.min(arr.length - 1, Math.round((arr.length - 1) * p)));
    return arr[idx];
  };

  return NextResponse.json({
    meanST,
    q05ST: q(0.05),
    q25ST: q(0.25),
    q50ST: q(0.50),
    q75ST: q(0.75),
    q95ST: q(0.95),
    qLoST: q(0.025),
    qHiST: q(0.975),
    pWin: n ? win / n : null,
    evAbs: n ? evAbs / n : null,
    evPct: n ? (evAbs / n) / denom : null
  });
}
