import { NextResponse } from "next/server";
import { yahooSearch } from "../../../lib/yahoo.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json({ results: [] });
  try {
    const results = await yahooSearch(q);
    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json({ results: [], error: e.message }, { status: 200 });
  }
}
