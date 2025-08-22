import { NextResponse } from "next/server";
import { Agent, type Dispatcher } from "undici";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE = (process.env.IB_PROXY_URL || process.env.IB_API_BASE || "http://127.0.0.1:5055").replace(/\/+$/, "");
const BEARER = process.env.IB_PROXY_TOKEN || "";
const BRIDGE = process.env.X_IB_BRIDGE_TOKEN || process.env.IB_BRIDGE_TOKEN || "";

async function fetchChain(url: string) {
  const dispatcher: Dispatcher | undefined = url.startsWith("https:")
    ? new Agent({ connect: { rejectUnauthorized: false } })
    : undefined;
  const headers: Record<string, string> = { accept: "application/json" };
  if (BEARER) headers["Authorization"] = `Bearer ${BEARER}`;
  else if (BRIDGE) headers["x-ib-bridge-token"] = BRIDGE;
  const opts: RequestInit & { dispatcher?: Dispatcher } = {
    headers,
    cache: "no-store",
    ...(dispatcher ? { dispatcher } : {}),
  };
  const r = await fetch(url, opts);
  const json = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, json };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").toUpperCase();
    if (!symbol) {
      return NextResponse.json({ error: "symbol is required" }, { status: 400 });
    }
    const url = `${BASE}/options/chain3?symbol=${encodeURIComponent(symbol)}`;
    const { ok, status, json } = await fetchChain(url);
    return NextResponse.json(json, { status: ok ? 200 : status || 500 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "chain proxy failed" }, { status: 500 });
  }
}
