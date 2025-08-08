export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const index = searchParams.get("index") || "SPX";
  const riskFree = 0.027;        // 2.7%
  const mrp = 0.055;             // 5.5%
  const pick = index === "STOXX" ? 0.072 : index === "NDX" ? 0.134 : 0.095; // annualized
  return new Response(JSON.stringify({ riskFree, mrp, indexAnn: pick }), {
    headers: { "content-type": "application/json" }
  });
}
