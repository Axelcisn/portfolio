// lib/options/math.js
// All inputs are numbers in base units:
// S0 spot, K strike, r risk-free (cont. comp), q dividend yield, mu selected drift (RF or CAPM),
// sigma annualized vol (e.g., 0.24), T in years, premium > 0
// Returns NaN-safe numbers (null when not computable).

/* ---------- Stats helpers ---------- */
export function isNum(x) { return Number.isFinite(x); }
export function clamp01(x){ return Math.min(1, Math.max(0, x)); }

/* Standard normal CDF via erf approximation (good enough for UI) */
export function Phi(z){
  if (!isNum(z)) return null;
  // Abramowitz-Stegun erf-based
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-0.5 * z * z);
  let p = d * t * (0.319381530 + t*(-0.356563782 + t*(1.781477937 + t*(-1.821255978 + 1.330274429*t))));
  if (z > 0) p = 1 - p;
  return p;
}

/* ---------- Black–Scholes core (risk-neutral for greeks) ---------- */
export function d1d2(S0, K, r = 0, q = 0, sigma = 0.2, T = 1){
  if (!(isNum(S0)&&isNum(K)&&isNum(sigma)&&sigma>0&&isNum(T)&&T>0)) return {d1:null,d2:null};
  const v = sigma * Math.sqrt(T);
  const m = Math.log(S0 / K) + (r - q + 0.5 * sigma * sigma) * T;
  const d1 = m / v;
  const d2 = d1 - v;
  return { d1, d2 };
}

/* Greeks (undiscounted price sensitivity at t=0) */
export function greeksCall(S0,K,r=0,q=0,sigma=0.2,T=1){
  const {d1,d2} = d1d2(S0,K,r,q,sigma,T);
  if (d1==null) return null;
  const Nd1 = Phi(d1), Nd2 = Phi(d2);
  const dfq = Math.exp(-q*T), dfr = Math.exp(-r*T);
  const n_d1 = (1/Math.sqrt(2*Math.PI))*Math.exp(-0.5*d1*d1);

  const delta = dfq*Nd1;
  const gamma = dfq*n_d1/(S0*sigma*Math.sqrt(T));
  const vega  = S0*dfq*n_d1*Math.sqrt(T);
  // Theta as per BS (per year)
  const theta = - (S0*dfq*n_d1*sigma)/2 - r*K*dfr*Nd2 + q*S0*dfq*Nd1;
  const rho   = K*T*dfr*Nd2;

  return { delta, gamma, theta, vega, rho };
}
export function greeksPut(S0,K,r=0,q=0,sigma=0.2,T=1){
  const {d1,d2} = d1d2(S0,K,r,q,sigma,T);
  if (d1==null) return null;
  const Nmd1 = Phi(-d1), Nmd2 = Phi(-d2);
  const dfq = Math.exp(-q*T), dfr = Math.exp(-r*T);
  const n_d1 = (1/Math.sqrt(2*Math.PI))*Math.exp(-0.5*d1*d1);

  const delta = dfq*(Ndash(-d1)-Ndash(0)) || (dfq*(Ndash?0:0)); // placeholder to keep symmetry
  // Simpler explicit:
  const delta2 = dfq*(Phi(d1)-1); // = dfq*(Nd1 - 1)
  const gamma  = dfq*n_d1/(S0*sigma*Math.sqrt(T));
  const vega   = S0*dfq*n_d1*Math.sqrt(T);
  const theta  = - (S0*dfq*n_d1*sigma)/2 + r*K*dfr*Nmd2 - q*S0*dfq*Nmd1;
  const rho    = -K*T*dfr*Nmd2;
  return { delta: delta2, gamma, theta, vega, rho };
}
// (small helper used above)
function Ndash(){ return null; }

/* ---------- Break-even ---------- */
export const beLongCall  = (K, prem) => (isNum(K)&&isNum(prem)) ? K + prem : null;
export const beShortCall = beLongCall;
export const beLongPut   = (K, prem) => (isNum(K)&&isNum(prem)) ? K - prem : null;
export const beShortPut  = beLongPut;

/* ---------- PoP under selected drift (mu), lognormal ---------- */
// z(x) = [ ln(x/S0) - (mu - 0.5σ^2)T ] / (σ√T)
function zAt(S0, x, mu, sigma, T){
  if(!(isNum(S0)&&isNum(x)&&isNum(mu)&&isNum(sigma)&&sigma>0&&isNum(T)&&T>0)) return null;
  const v = sigma * Math.sqrt(T);
  return (Math.log(x/S0) - (mu - 0.5*sigma*sigma)*T) / v;
}
// Long call: profit if ST > BE
export function popLongCall(S0,K,prem,mu,sigma,T){
  const BE = beLongCall(K,prem); const z = zAt(S0, BE, mu, sigma, T);
  return (BE!=null && z!=null) ? (1 - Phi(z)) : null;
}
// Short call: profit if ST < BE
export function popShortCall(S0,K,prem,mu,sigma,T){
  const BE = beShortCall(K,prem); const z = zAt(S0, BE, mu, sigma, T);
  return (BE!=null && z!=null) ? Phi(z) : null;
}
// Long put: profit if ST < BE
export function popLongPut(S0,K,prem,mu,sigma,T){
  const BE = beLongPut(K,prem); const z = zAt(S0, BE, mu, sigma, T);
  return (BE!=null && z!=null) ? Phi(z) : null;
}
// Short put: profit if ST > BE
export function popShortPut(S0,K,prem,mu,sigma,T){
  const BE = beShortPut(K,prem); const z = zAt(S0, BE, mu, sigma, T);
  return (BE!=null && z!=null) ? (1 - Phi(z)) : null;
}

/* ---------- Expected profit & return under real-world μ ---------- */
// Using BS-like closed form with μ replacing r and e^{(μ-q)T} on S term.
// EP = E[payoff] -/+ premium; ER = EP / |premium|
function d1d2_mu(S0,K,mu=0,q=0,sigma=0.2,T=1){
  if (!(isNum(S0)&&isNum(K)&&isNum(sigma)&&sigma>0&&isNum(T)&&T>0)) return {d1:null,d2:null};
  const v = sigma*Math.sqrt(T);
  const m = Math.log(S0/K) + (mu - q + 0.5*sigma*sigma)*T;
  const d1 = m / v, d2 = d1 - v;
  return { d1, d2 };
}
export function expProfitLongCall(S0,K,prem,mu,q=0,sigma,T){
  const {d1,d2} = d1d2_mu(S0,K,mu,q,sigma,T); if(d1==null) return null;
  const term = S0*Math.exp((mu - q)*T)*Phi(d1) - K*Phi(d2);
  return term - (isNum(prem)?prem:0);
}
export function expProfitShortCall(S0,K,prem,mu,q=0,sigma,T){
  const ep = expProfitLongCall(S0,K,prem,mu,q,sigma,T); return (ep==null)?null:(-ep);
}
export function expProfitLongPut(S0,K,prem,mu,q=0,sigma,T){
  const {d1,d2} = d1d2_mu(S0,K,mu,q,sigma,T); if(d1==null) return null;
  const term = K*Phi(-d2) - S0*Math.exp((mu - q)*T)*Phi(-d1);
  return term - (isNum(prem)?prem:0);
}
export function expProfitShortPut(S0,K,prem,mu,q=0,sigma,T){
  const ep = expProfitLongPut(S0,K,prem,mu,q,sigma,T); return (ep==null)?null:(-ep);
}
export const expReturn = (ep, prem) => (isNum(ep)&&isNum(prem)&&Math.abs(prem)>0) ? (ep/Math.abs(prem)) : null;

/* ---------- Sharpe via light MC on returns ---------- */
// Returns are Profit / |premium|; subtract r*T in numerator (excess return).
export function sharpeMC({
  S0, K, prem, kind="call", side="long",
  mu=0, q=0, sigma=0.2, r=0, T=1, paths=12000
}){
  if(!(isNum(S0)&&isNum(K)&&isNum(prem)&&isNum(mu)&&isNum(sigma)&&sigma>0&&isNum(T)&&T>0&&paths>100)) return null;
  const ret = [];
  const sdt = sigma*Math.sqrt(T);
  const drift = (mu - q - 0.5*sigma*sigma)*T;

  const payoff = (ST)=>{
    if(kind==="call"){
      const core = Math.max(ST-K,0);
      return side==="long" ? (core - prem) : (prem - core);
    }else{
      const core = Math.max(K-ST,0);
      return side==="long" ? (core - prem) : (prem - core);
    }
  };
  const denom = Math.abs(prem);
  if(denom<=0) return null;

  for(let i=0;i<paths;i++){
    // Box–Muller
    const u = Math.random(); const v = Math.random();
    const z = Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
    const ST = S0*Math.exp(drift + sdt*z);
    const pr = payoff(ST);
    ret.push(pr/denom);
  }
  // mean & stdev
  const n = ret.length;
  const m = ret.reduce((a,b)=>a+b,0)/n;
  const vr = ret.reduce((a,b)=>a+(b-m)*(b-m),0)/(n-1);
  const sd = Math.sqrt(Math.max(0,vr));
  const ex = m - r*T; // excess vs risk-free over the horizon
  return (sd>0) ? (ex/sd) : null;
}
