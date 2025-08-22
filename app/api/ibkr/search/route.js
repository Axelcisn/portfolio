// app/api/ibkr/search/route.js
// IBKR-backed symbol autocomplete via Client Portal Web API.
// Primary: POST /iserver/secdef/search; Fallback: GET /trsrv/stocks
// Supports: IB_PROXY_URL (proxy) or local gateway https://localhost:PORT/v1/api

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import https from "node:https";
import http from "node:http";
import { readFileSync } from "node:fs";

/* ---------- base URL (proxy or local) ---------- */
function getLocalPort() {
  try { return (readFileSync("/tmp/ibkr_gateway_port","utf8").trim() || "5001"); }
  catch { return process.env.IBKR_PORT || "5001"; }
}
const BASE = (process.env.IB_PROXY_URL || `https://localhost:${getLocalPort()}/v1/api`).replace(/\/+$/,"");
const BEARER = process.env.IB_PROXY_TOKEN || "";

/* ---------- low-level request (tolerates self-signed) ---------- */
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
        let json; try { json = JSON.parse(data); } catch { json = data; }
        resolve({ status: res.statusCode || 0, headers: res.headers, json });
      });
    });
    req.on("error", reject);
    if (body) req.write(typeof body === "string" ? body : JSON.stringify(body));
    req.end();
  });
}

/* ---------- helpers & mappers ---------- */
const normQ = (q) => (q || "").trim();
const pickStr = (...xs) => xs.find(v => typeof v === "string" && v && v.trim()) || undefined;
const pickNum = (...xs) => {
  for (const v of xs) { const n = typeof v === "number" ? v : Number(v); if (Number.isFinite(n)) return n; }
  return undefined;
};

/** Map the simple array returned by /iserver/secdef/search */
function mapPrimary(arr = [], limit = 8) {
  const out = []; const seen = new Set();
  for (const r of (Array.isArray(arr) ? arr : [])) {
    const item = {
      conid:    pickNum(r.conid, r.contractId, r.cnid, r.id) || null,
      symbol:   pickStr(r.symbol, r.localSymbol, r.ticker) || null,
      name:     pickStr(r.description, r.companyName, r.name, r.fullName) || null,
      exchange: pickStr(r.exchange, r.primaryExchange, r.listingExchange) || null,
      currency: pickStr(r.currency, r.ccy) || null,
      secType:  pickStr(r.secType, r.sec_type, r.type) || null
    };
    if (!item.symbol && !item.name) continue;
    const key = `${item.conid || item.symbol}-${item.exchange || ""}`;
    if (seen.has(key)) continue; seen.add(key);
    out.push(item); if (out.length >= limit) break;
  }
  return out;
}

/** Flatten the object/array styles that /trsrv/stocks can return (often {SYMBOL:[{name,contracts:[...]},...]}) */
function mapTrsrvStocks(json, limit = 8) {
  const out = []; const seen = new Set();
  if (!json) return out;

  const entries = Array.isArray(json) ? [["", json]] : Object.entries(json);
  for (const [symKey, list] of entries) {
    for (const entry of (Array.isArray(list) ? list : [])) {
      const parentName   = pickStr(entry.name, entry.companyName, entry.description);
      const parentSymbol = pickStr(entry.symbol, symKey);
      const contracts    = Array.isArray(entry.contracts) ? entry.contracts : [];

      if (contracts.length) {
        for (const c of contracts) {
          const item = {
            conid:    pickNum(c.conid, c.contractId, c.id) || null,
            symbol:   pickStr(c.symbol, parentSymbol) || null,
            name:     parentName || null,
            exchange: pickStr(c.exchange, c.primaryExchange) || null,
            currency: pickStr(c.currency, c.ccy) || null,
            secType:  "STK"
          };
          if (!item.conid && !item.symbol) continue;
          const key = `${item.conid || item.symbol}-${item.exchange || ""}`;
          if (seen.has(key)) continue; seen.add(key);
          out.push(item); if (out.length >= limit) return out;
        }
      } else {
        const item = {
          conid:    pickNum(entry.conid, entry.contractId, entry.id) || null,
          symbol:   pickStr(entry.symbol, parentSymbol) || null,
          name:     parentName || null,
          exchange: pickStr(entry.exchange, entry.primaryExchange) || null,
          currency: pickStr(entry.currency, entry.ccy) || null,
          secType:  pickStr(entry.secType, entry.sec_type, entry.type) || "STK"
        };
        if (!item.symbol && !item.name) continue;
        const key = `${item.conid || item.symbol}-${item.exchange || ""}`;
        if (seen.has(key)) continue; seen.add(key);
        out.push(item); if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

/* ---------- core search (primary → fallback) ---------- */
async function searchCore(q, limit) {
  // 1) Primary
  const primary = await ibRequest("/iserver/secdef/search", { method: "POST", body: { symbol: q, name: true } });
  if (primary.status >= 200 && primary.status < 300 && Array.isArray(primary.json)) {
    const list = mapPrimary(primary.json, limit);
    if (list.length) return list;
  }

  // 2) Fallback (note: "symbols" plural per IBKR)
  const fb = await ibRequest(`/trsrv/stocks?symbols=${encodeURIComponent(q)}`, { method: "GET" });
  if (fb.status >= 200 && fb.status < 300 && fb.json) {
    return mapTrsrvStocks(fb.json, limit);
  }

  return [];
}

/* ---------- handlers ---------- */
const ok  = (data) => NextResponse.json(data, { status: 200 });
const err = (status, data) => NextResponse.json(data, { status });

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = normQ(searchParams.get("q") || searchParams.get("symbol") || searchParams.get("query"));
  const limit = Math.min(20, Math.max(1, +(searchParams.get("limit") || 8)));
  if (!q) return ok({ ok: true, source: "ibkr", q: "", count: 0, data: [] });

  try {
    const data = await searchCore(q, limit);
    return ok({ ok: true, source: "ibkr", q, count: data.length, data });
  } catch (e) {
    return err(502, { ok: false, error: String(e?.message || e) });
  }
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const q = normQ(body.q || body.symbol || body.query);
  const limit = Math.min(20, Math.max(1, +(body.limit || 8)));
  if (!q) return ok({ ok: true, source: "ibkr", q: "", count: 0, data: [] });

  try {
    const data = await searchCore(q, limit);
    return ok({ ok: true, source: "ibkr", q, count: data.length, data });
  } catch (e) {
    return err(502, { ok: false, error: String(e?.message || e) });
  }
}
