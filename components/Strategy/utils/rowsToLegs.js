// components/Strategy/utils/rowsToLegs.js
"use client";

/**
 * Convert PositionBuilder rows -> legs for BE library/API.
 * Supports lc/sc/lp/sp and (optionally) ls/ss stock legs.
 */
export function rowsToLegs(rows = []) {
  const out = [];
  for (const r of rows) {
    if (!r) continue;
    if (r.enabled === false) continue;

    const t = String(r.type || "").toLowerCase();
    let kind = null, side = null;
    if (t === "lc") { kind = "call";  side = "long";  }
    else if (t === "sc") { kind = "call";  side = "short"; }
    else if (t === "lp") { kind = "put";   side = "long";  }
    else if (t === "sp") { kind = "put";   side = "short"; }
    else if (t === "ls") { kind = "stock"; side = "long";  }
    else if (t === "ss") { kind = "stock"; side = "short"; }
    else continue;

    const qty = Math.abs(Number(r.qty ?? 1)) || 1;

    if (kind === "stock") {
      // Library uses .premium for stock basis; API route uses .price (but we don't send stock to API here).
      const price = Number(r.price);
      const leg = { kind, side, qty };
      if (Number.isFinite(price)) leg.premium = price;
      out.push(leg);
      continue;
    }

    const strike = Number(r.K);
    const premium = Number(r.premium);
    out.push({
      kind,
      side,
      qty,
      strike: Number.isFinite(strike) ? strike : null,
      ...(Number.isFinite(premium) ? { premium } : {}),
    });
  }
  return out;
}

export default rowsToLegs;
