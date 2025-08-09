import { NextResponse } from "next/server";
import { yahooSearch } from "../../../../lib/yahoo";

export const runtime = "nodejs";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    if (!q) {
      return NextResponse.json({ results: [] });
    }
    const results = await yahooSearch(q);
    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json(
      { results: [], error: String(err?.message || err) },
      { status: 200 }
    );
  }
}
