// app/api/company/search/route.js
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { error: "Yahoo company search API is disabled" },
    { status: 503 }
  );
}
