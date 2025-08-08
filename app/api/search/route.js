export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").toUpperCase();
  const all = [
    { symbol: "AAPL", name: "Apple Inc.", currency: "USD" },
    { symbol: "MSFT", name: "Microsoft Corporation", currency: "USD" },
    { symbol: "NVDA", name: "NVIDIA Corporation", currency: "USD" },
    { symbol: "TSLA", name: "Tesla, Inc.", currency: "USD" },
    { symbol: "AMZN", name: "Amazon.com, Inc.", currency: "USD" },
    { symbol: "META", name: "Meta Platforms, Inc.", currency: "USD" },
    { symbol: "ENEL.MI", name: "Enel SpA", currency: "EUR" },
    { symbol: "SPY", name: "SPDR S&P 500 ETF", currency: "USD" }
  ];
  const results = all.filter(x => x.symbol.includes(q) || x.name.toUpperCase().includes(q)).slice(0, 8);
  return new Response(JSON.stringify({ results }), { headers: { "content-type": "application/json" } });
}
