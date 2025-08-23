export const fmtPct = (v, d = 2) => (isFinite(v) ? `${(v * 100).toFixed(d)}%` : "—");
export const fmtNum = (v, d = 2) => (isFinite(v) ? Number(v).toFixed(d) : "—");
export const fmtCur = (v, ccy = "EUR", d = 2) => {
  if (v == null || !isFinite(v)) return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: ccy, maximumFractionDigits: d }).format(v);
  } catch {
    return Number(v).toFixed(d);
  }
};
