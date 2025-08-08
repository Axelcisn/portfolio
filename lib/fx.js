// Use exchangerate.host (no key) to convert listing currency → EUR
const FX_BASE = "https://api.exchangerate.host/latest";

export async function fxToEUR(fromCcy) {
  if (!fromCcy || fromCcy === "EUR") return { rate: 1, via: "static" };
  const u = `${FX_BASE}?base=${encodeURIComponent(fromCcy)}&symbols=EUR`;
  const res = await fetch(u, { cache: "no-store" });
  if (!res.ok) return { rate: null, via: "error" };
  const j = await res.json();
  const rate = j?.rates?.EUR ?? null;
  return { rate, via: "exchangerate.host" };
}
