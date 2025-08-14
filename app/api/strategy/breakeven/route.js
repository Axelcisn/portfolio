// app/api/strategy/breakeven/route.js
// Compute break-even prices for option strategies.
// Supports POST (preferred) and a minimal GET mode.
// Always returns 200 with { ok: true|false } so legacy UIs never show "fetch failed".

import { NextResponse } from "next/server";
import { computeBreakEvens } from "../../../../lib/strategy/breakeven.js";
import { mget, mset, mkey, stableStringify } from "../../../../lib/server/mcache.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL_MS = 60 * 1000;
const cacheHeaders = { "Cache-Control": "s-maxage=60, stale-while-revalidate=30" };

function ok(payload, status = 200) {
  return NextResponse.json(payload, { status, headers: cacheHeaders });
}
function err(code, message) {
  return ok({ ok: false, error: message, errorObj: { code, message } }, 200);
}

async function parseBody(req) {
  try {
    const body = await req.json();
    if (Array.isArray(body)) {
      // Allow raw legs array as body
      return { legs: body, strategy: undefined };
    }
    return {
      legs: body?.legs ?? body?.data?.legs ?? null,
      strategy: body?.strategy ?? body?.data?.strategy ?? undefined,
    };
  } catch {
    return { legs: null, strategy: undefined };
  }
}

function parseQuery(req) {
  const { searchParams } = new URL(req.url);
  const legsParam = searchParams.get("legs");
  const strategy = searchParams.get("strategy") || undefined;

  if (!legsParam) return { legs: null, strategy };

  // Try JSON; if that fails, try base64(JSON)
  let legs = null;
  try {
    legs = JSON.parse(legsParam);
  } catch {
    try {
      const txt = Buffer.from(legsParam, "base64").toString("utf8");
      legs = JSON.parse(txt);
    } catch { /* ignore */ }
  }
  return { legs, strategy };
}

function buildKey(legs, strategy) {
  // Deterministic micro-cache key for identical requests
  return mkey("be", stableStringify({ legs, strategy }));
}

function shapeResponse(res, t0, cache = "miss") {
  const be = Array.isArray(res?.be) ? res.be : [];
  const meta = res?.meta || {};
  return {
    ok: true,
    be,
    meta,
    count: be.length,
    _ms: Date.now() - t0,
    cache,
  };
}

export async function POST(req) {
  const t0 = Date.now();
  try {
    const { legs, strategy } = await parseBody(req);
    if (!Array.isArray(legs) || legs.length === 0) {
      return err("LEGS_REQUIRED", "legs[] required in JSON body");
    }

    const key = buildKey(legs, strategy);
    const hit = mget(key);
    if (hit) return ok({ ...hit, cache: "hit" });

    const res = computeBreakEvens({ legs, strategy });
    const payload = shapeResponse(res, t0, "miss");

    mset(key, payload, TTL_MS);
    return ok(payload);
  } catch (e) {
    return err("INTERNAL_ERROR", String(e?.message ?? e));
  }
}

export async function GET(req) {
  const t0 = Date.now();
  try {
    const { legs, strategy } = parseQuery(req);
    if (!Array.isArray(legs) || legs.length === 0) {
      return err("LEGS_REQUIRED", "pass ?legs=<json> (or base64 JSON) and optional &strategy=...");
    }

    const key = buildKey(legs, strategy);
    const hit = mget(key);
    if (hit) return ok({ ...hit, cache: "hit" });

    const res = computeBreakEvens({ legs, strategy });
    const payload = shapeResponse(res, t0, "miss");

    mset(key, payload, TTL_MS);
    return ok(payload);
  } catch (e) {
    return err("INTERNAL_ERROR", String(e?.message ?? e));
  }
}
