// app/api/expiries/filtered/route.js
export const dynamic = "force-dynamic";

const Y = "https://query2.finance.yahoo.com";

const UA = {
  Accept: "application/json, text/plain, */*",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
};

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

async function yjson(url) {
  const r = await fetch(url, { headers: UA, cache: "no-store" });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

// simple concurrency limiter
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function run() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, run)
  );
  return out;
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").trim();
    if (!symbol)
      return Response.json(
        { ok: false, error: "symbol required" },
        { status: 400 }
      );

    const minVol = Math.max(0, Number(searchParams.get("minVol") ?? 1) || 0);
    const useOI = (searchParams.get("useOI") ?? "1") !== "0";

    // 1) fetch list of available expirations
    const root = await yjson(`${Y}/v7/finance/options/${encodeURIComponent(symbol)}`);
    const base = root?.optionChain?.result?.[0];
    const dates = Array.isArray(base?.expirationDates) ? base.expirationDates : [];
    if (!dates.length) {
      return Response.json({ ok: true, data: { dates: [] } });
    }

    // 2) for each expiry, fetch chain and keep only those with activity
    const picked = await mapLimit(dates, 6, async (unix) => {
      try {
        const j = await yjson(
          `${Y}/v7/finance/options/${encodeURIComponent(symbol)}?date=${unix}`
        );
        const node = j?.optionChain?.result?.[0]?.options?.[0];
        const calls = Array.isArray(node?.calls) ? node.calls : [];
        const puts = Array.isArray(node?.puts) ? node.puts : [];

        const vol =
          calls.reduce((s, o) => s + n(o?.volume), 0) +
          puts.reduce((s, o) => s + n(o?.volume), 0);

        const oi =
          calls.reduce((s, o) => s + n(o?.openInterest), 0) +
          puts.reduce((s, o) => s + n(o?.openInterest), 0);

        const active = vol >= minVol || (useOI && oi > 0);
        if (!active) return null;

        const iso = new Date(unix * 1000).toISOString().slice(0, 10);
        return iso;
      } catch {
        return null;
      }
    });

    const isoDates = picked.filter(Boolean);
    return Response.json({ ok: true, data: { dates: isoDates } });
  } catch (err) {
    return Response.json(
      { ok: false, error: err?.message || "failed" },
      { status: 500 }
    );
  }
}
