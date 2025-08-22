// app/api/company/route.js
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { error: "Yahoo company price API is disabled" },
    { status: 503 }
  );
}
