// app/api/options/route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  getYahooSession,
  setYahooSession,
  clearYahooSession,
} from "../../../lib/yahooSession";

// Helpers
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const BASE = "https://query2.finance.yahoo.com/v7/finance/options";

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const toUnix = (v) => {
  if (!v) return null;
  if (/^\d{10}$/.test(v)) return Number(v);
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? Math.floor(d.getTime() / 1000) : null;
};
const buildUrl = (symbol, unix, crumb) =>
  `${BASE}/${encodeURIComponent(symbol)}${unix ? `?date=${unix}` : ""}${
    crumb ? (unix ? `&crumb=${crumb}` : `?crumb=${crumb}`) : ""
  }`;

function joinCookie(setCookieHeader) {
  const raw = setCookieHeader || "";
  // Grab first key=value from each cookie; tolerate comma-separated header
  const pairs = [...raw.matchAll(/(?:^|,)\s*([A-Za-z0-9_]+)=([^;,\s]+)/g)].map(
    (m) => `${m[1]}=${m[2]}`
  );
  return pairs.join("; ");
}

async function handshake() {
  // 1) Touch fc.yahoo.com to receive cookies
  const pre = await fetch("https://fc.yahoo.com", {
    cache: "no-store",
    redirect: "manual",
    headers: { "User-Agent": UA },
  });
  const cookie = joinCookie(pre.headers.get("set-cookie"));

  // 2) Fetch crumb with those cookies
  const crumbResp = await fetch(
    "https://query2.finance.yahoo.com/v1/test/getcrumb",
    {
      cache: "no-store",
      headers: { "User-Agent": UA, Cookie: cookie },
    }
  );
  const crumb = (await crumbResp.text()).trim();

  // Persist in-memory (per server instance)
  setYahooSession({ cookie, crumb, ts: Date.now() });
  return { cookie, crumb };
}

async function fetchOptions(symbol, unix) {
  const sess = getYahooSession();
  // Attempt with session (if any)
  if (sess?.crumb || sess?.cookie) {
    const res = await fetch(buildUrl(symbol, unix, sess.crumb), {
      cache: "no-store",
      headers: {
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.8",
        "User-Agent": UA,
        Referer: "https://finance.yahoo.com/",
        ...(sess.cookie ? { Cookie: sess.cookie } : {}),
      },
    });
    if (res.status !== 401 && res.status !== 403) return res;
    // Session seems stale; clear and fall through to handshake
    clearYahooSession();
  }

  // Try without session first
  let res = await fetch(buildUrl(symbol, unix), {
    cache: "no-store",
    headers: {
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.8",
      "User-Agent": UA,
      Referer: "https://finance.yahoo.com/",
    },
  });
  if (res.status !== 401 && res.status !== 403) return res;

  // Perform crumb/cookie handshake and retry once
  const fresh = await handshake();
  res = await fetch(buildUrl(symbol, unix, fresh.crumb), {
    cache: "no-store",
    headers: {
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.8",
      "User-Agent": UA,
      Referer: "https://finance.yahoo.com/",
      Cookie: fresh.cookie,
    },
  });
  return res;
}

/**
 * GET /api/options?symbol=TSLA&date=YYYY-MM-DD
 * Returns: { ok, data: { calls, puts, meta } }
 */
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "").trim();
  const dateParam = (searchParams.get("date") || "").trim();

  if (!symbol) {
    return Response.json(
      { ok: false, error: "symbol required" },
      { status: 400 }
    );
  }

  const unix = toUnix(dateParam);
  const res = await fetchOptions(symbol, unix);

  if (!res.ok) {
    return Response.json(
      { ok: false, error: `Yahoo ${res.status} ${res.statusText}` },
      { status: 502 }
    );
  }

  try {
    const j = await res.json();
    const root = j?.optionChain?.result?.[0];
    if (!root) {
      return Response.json(
        { ok: false, error: "empty chain" },
        { status: 502 }
      );
    }

    const quote = root.quote || {};
    const spot =
      num(quote.regularMarketPrice) ??
      num(quote.postMarketPrice) ??
      num(quote.bid) ??
      num(quote.ask);

    const node = (root.options && root.options[0]) || {};
    const calls = Array.isArray(node.calls) ? node.calls : [];
    const puts = Array.isArray(node.puts) ? node.puts : [];

    const mapOpt = (o) => ({
      strike: num(o?.strike),
      bid: num(o?.bid),
      ask: num(o?.ask),
      price: num(o?.lastPrice ?? o?.last ?? o?.regularMarketPrice),
      ivPct:
        num(o?.impliedVolatility) != null
          ? num(o.impliedVolatility) * 100
          : null,
    });

    const expiryUnix = num(node?.expiration);
    const expiry =
      expiryUnix != null
        ? new Date(expiryUnix * 1000).toISOString().slice(0, 10)
        : null;

    return Response.json({
      ok: true,
      data: {
        calls: calls.map(mapOpt).filter((x) => x.strike != null),
        puts: puts.map(mapOpt).filter((x) => x.strike != null),
        meta: {
          symbol: quote?.symbol || symbol.toUpperCase(),
          currency: quote?.currency || null,
          spot,
          expiry,
        },
      },
    });
  } catch (err) {
    return Response.json(
      { ok: false, error: err?.message || "parse failed" },
      { status: 500 }
    );
  }
}
