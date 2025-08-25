export async function fetchJSON<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { ...(init?.headers||{}), 'Cache-Control': 'no-store' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
