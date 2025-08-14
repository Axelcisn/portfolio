// components/Strategy/utils/rowsToApiLegs.js

/**
 * Convert PositionBuilder rows ➜ API legs for /api/strategy/breakeven.
 * Builder row example:
 *   { type:'lc'|'sc'|'lp'|'sp'|'ls'|'ss', K?, strike?, premium?, qty?, price? }
 * API leg shape:
 *   { type:'call'|'put'|'stock', side:'long'|'short', qty:number,
 *     strike?: number|null, premium?: number, price?: number }
 */
export function rowsToApiLegs(rows = []) {
  const out = [];

  for (const r of rows || []) {
    if (!r) continue;
    const t = String(r.type || "").toLowerCase();

    // map builder codes -> (type, side)
    let type = null, side = null;
    if (t === "lc") { type = "call";  side = "long"; }
    else if (t === "sc") { type = "call";  side = "short"; }
    else if (t === "lp") { type = "put";   side = "long"; }
    else if (t === "sp") { type = "put";   side = "short"; }
    else if (t === "ls") { type = "stock"; side = "long"; }
    else if (t === "ss") { type = "stock"; side = "short"; }
    else continue; // ignore unknowns (UI can pass other helper rows)

    // qty: default 1 for options; allow 0/negative filtered upstream
    const qtyNum = Number(r.qty);
    const qty = Number.isFinite(qtyNum) ? Math.max(0, qtyNum) : 1;

    if (type === "stock") {
      // stock leg may carry price in r.price or r.premium (builder variance)
      const priceNum = Number(r.price ?? r.premium);
      const leg = { type, side, qty };
      if (Number.isFinite(priceNum)) leg.price = Number(priceNum);
      out.push(leg);
      continue;
    }

    // options
    const strikeRaw = r.K ?? r.strike;
    const strikeNum = Number(strikeRaw);
    const premiumNum = Number(r.premium);

    const leg = {
      type, side, qty,
      strike: Number.isFinite(strikeNum) ? Number(strikeNum) : null,
    };
    if (Number.isFinite(premiumNum)) leg.premium = Number(premiumNum);

    out.push(leg);
  }

  return out;
}

export default rowsToApiLegs;
