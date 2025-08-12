// lib/client/options.js
export async function fetchOptions(symbol, date) {
  const params = new URLSearchParams({ symbol: String(symbol || "").trim() });
  if (date) params.set("date", date);

  const res = await fetch(`/api/options?${params.toString()}`, { cache: "no-store" });
  const json = await res.json();

  if (!res.ok || !json?.ok) {
    const msg = json?.error || `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  // shape: { calls, puts, meta }
  return json.data || { calls: [], puts: [], meta: {} };
}
// lib/client/options.js
// (keep your existing fetchOptions export as-is)

export async function fetchExpiriesFiltered(symbol, opts = {}) {
  const { minVol = 1, useOI = true } = opts;
  const params = new URLSearchParams({ symbol: String(symbol || "").trim() });
  if (minVol != null) params.set("minVol", String(minVol));
  if (useOI === false) params.set("useOI", "0");

  const res = await fetch(`/api/expiries/filtered?${params.toString()}`, {
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok || !json?.ok) {
    const msg = json?.error || `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return json?.data?.dates ?? [];
}
