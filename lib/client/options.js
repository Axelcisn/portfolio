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
