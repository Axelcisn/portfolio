// From a list of daily closes → log returns → annualized drift & vol
export function logReturns(closes) {
  const r = [];
  for (let i = 1; i < closes.length; i++) {
    const a = closes[i], b = closes[i - 1];
    if (a > 0 && b > 0) r.push(Math.log(a / b));
  }
  return r;
}

export function mean(xs) {
  if (!xs.length) return 0;
  let s = 0; for (const x of xs) s += x;
  return s / xs.length;
}
export function stdev(xs) {
  if (xs.length <= 1) return 0;
  const m = mean(xs);
  let v = 0; for (const x of xs) v += (x - m) * (x - m);
  return Math.sqrt(v / (xs.length - 1));
}

export function annualizedFromDailyLogs(rets, tradingDays = 252) {
  const muD = mean(rets);
  const sdD = stdev(rets);
  return { driftA: muD * tradingDays, volA: sdD * Math.sqrt(tradingDays) };
}
