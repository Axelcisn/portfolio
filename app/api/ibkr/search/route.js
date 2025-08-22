// IBKR-backed symbol autocomplete via Client Portal Web API.
// Primary: POST /iserver/secdef/search; Fallback: GET /trsrv/stocks
// Env: IB_PROXY_URL (optional, defaults to local gateway); IB_PROXY_TOKEN (optional bearer)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import https from "node:https";
import http from "node:http";
import { readFileSync } from "node:fs";

function getPort() {
  try {
    return (readFileSync("/tmp/ibkr_gateway_port", "utf8").trim() || "5001");
  } catch {
    return process.env.IBKR_PORT || "5001";
  }
}

const BASE = (process.env.IB_PROXY_URL || `https://localhost:${getPort()}/v1/api`).replace(/\/+$/,'');
const BEARER = process.env.IB_PROXY_TOKEN || "";

/** Low-level request using Node http/https; allows self-signed proxies */
function ibRequest(path, { method="GET", body, timeoutMs=8000 } = {}) {
  const url = new URL(BASE + path);
  const isHttps = url.protocol === "https:";
  const agent = isHttps ? new https.Agent({ rejectUnauthorized: false }) : undefined;

  return new Promise((resolve, reject) => {
    const req = (isHttps ? https : http).request({
      method,
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        ...(BEARER ? { "Authorization": `Bearer ${BEARER}` } : {})
      },
      agent,
      timeout: timeoutMs
    }, res => {
      let data = "";
      res.on("data", d => { data += d; });
      res.on("end", () => {
        let json;
        try { json = JSON.parse(data); } catch { json = data; }
        resolve({ status: res.statusCode || 0, headers: res.headers, json });
      });
    });
    req.on("error", reject);
    if (body) req.write(typeof body === "string" ? body : JSON.stringify(body));
    req.end();
  });
}

function normQ(q) { return (q || "").trim(); }
function pickStr(...xs){ return xs.find(v => typeof v === "string" && v.trim()); }
function pickNum(...xs){ return xs.find(v => Number.isFinite(v)); }

function mapResults(arr = [], limit = 8) {
  const out = [];
  const seen = new Set();
  for (const r of (Array.isArray(arr) ? arr : [])) {
    const item = {
      conid: pickNum(r.conid, r.contractId, r.cnid, r.id) || null,
      symbol: pickStr(r.symbol, r.localSymbol, r.ticker) || null,
      name:   pickStr(r.description, r.companyName, r.name, r.fullName) || null,
      exchange: pickStr(r.exchange, r.primaryExchange, r.listingExchange) || null,
      currency: pickStr(r.currency, r.ccy) || null,
      secType:  pickStr(r.secType, r.sec_type, r.type) || null
    };
    if (!item.symbol && !item.name) continue;
    const key = `${item.conid || item.symbol}-${item.exchange || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

async function searchCore(q, limit) {
  // 1) Primary search
  const primary = await ibRequest("/iserver/secdef/search", {
    method: "POST",
    body: { symbol: q, name: true }
  });
  if (primary.status >= 200 && primary.status < 300) {
    const list = mapResults(primary.json, limit);
    if (list.length) return list;
  }
  // 2) Fallback
  const fb = await ibRequest(`/trsrv/stocks?symbol=${encodeURIComponent(q)}`, { method: "GET" });
  if (fb.status >= 200 && fb.status < 300 && fb.json) {
    const list = Array.isArray(fb.json) ? fb.json : Object.values(fb.json).flat();
    return mapResults(list, limit);
  }
  return [];
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = normQ(searchParams.get("q"));
  const limit = Math.min(20, Math.max(1, +(searchParams.get("limit") || 8)));
  if (!q) return NextResponse.json({ ok:true, source:"ibkr", q, count:0, data:[] });
  try {
    const data = await searchCore(q, limit);
    return NextResponse.json({ ok:true, source:"ibkr", q, count:data.length, data });
  } catch (err) {
    return NextResponse.json({ ok:false, error:String(err?.message || err) }, { status:502 });
  }
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const q = normQ(body.q || body.query || body.symbol);
  const limit = Math.min(20, Math.max(1, +(body.limit || 8)));
  if (!q) return NextResponse.json({ ok:true, source:"ibkr", q, count:0, data:[] });
  try {
    const data = await searchCore(q, limit);
    return NextResponse.json({ ok:true, source:"ibkr", q, count:data.length, data });
  } catch (err) {
    return NextResponse.json({ ok:false, error:String(err?.message || err) }, { status:502 });
  }
}

