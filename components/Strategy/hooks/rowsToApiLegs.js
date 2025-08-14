// components/Strategy/hooks/rowsToApiLegs.js

/** Convert PositionBuilder rows ➜ legs expected by /api/strategy/breakeven */
export function rowsToApiLegs(rows = []) {
  const out = [];
  for (const r of rows || []) {
    if (!r) continue;
    const t = String(r?.type ?? "").toLowerCase();

    // map builder codes -> (type, side)
    let type = null, side = null;
    switch (t) {
      case "lc": type = "call";  side = "long";  break;
      case "sc": type = "call";  side = "short"; break;
      case "lp": type = "put";   side = "long";  break;
      case "sp": type = "put";   side = "short"; break;
      case "ls": type = "stock"; side = "long";  break;
      case "ss": type = "stock"; side = "short"; break;
      default: continue; // ignore unknowns
    }

    const qty = toNum(r?.qty);
    const base = { type, side, qty: qty != null ? Math.max(0, qty) : 1 };

    if (type === "stock") {
      // stock legs can carry price in r.price or r.premium (builder-dependent)
      const price = toNum(r?.price ?? r?.premium);
      out.push(price != null ? { ...base, price } : base);
    } else {
      const strike  = toNum(r?.K ?? r?.strike);
      const premium = toNum(r?.premium);
      out.push({
        ...base,
        strike: strike != null ? strike : null,
        ...(premium != null ? { premium } : {}),
      });
    }
  }
  return out;
}

function toNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

export default rowsToApiLegs;
