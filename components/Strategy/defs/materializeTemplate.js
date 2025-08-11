// components/Strategy/defs/materializeTemplate.js
import TEMPLATES, { VALID_LEG_TYPES } from "./strategyTemplates";

/**
 * Convert the company-card time to "days".
 * - env.T (years) -> days
 * - env.defaultDays (days) -> days
 * Fallback = 30 days.
 */
function getCardDays(env = {}) {
  const Ty = Number(env?.T);
  if (Number.isFinite(Ty) && Ty > 0 && Ty < 10) {
    return Math.max(1, Math.round(Ty * 365));
  }
  const d = Number(env?.defaultDays);
  if (Number.isFinite(d) && d > 0) return Math.round(d);
  return 30;
}

/**
 * Resolve expiry token to days.
 * - "card" -> cardDays
 * - "card+<N>" -> cardDays + N
 * - <number> -> fixed days
 * - undefined/null -> cardDays
 */
function resolveExpiryToken(expiry, cardDays) {
  if (expiry == null) return Math.max(1, Math.round(cardDays));
  if (typeof expiry === "number" && Number.isFinite(expiry)) {
    return Math.max(1, Math.round(expiry));
  }
  if (typeof expiry === "string") {
    if (expiry.toLowerCase() === "card") return Math.max(1, Math.round(cardDays));
    const m = expiry.match(/^card\+(\d+)$/i);
    if (m) return Math.max(1, Math.round(cardDays + Number(m[1] || 0)));
  }
  // default: use card
  return Math.max(1, Math.round(cardDays));
}

const isStock = (t) => t === "ls" || t === "ss";
const uid = () => Math.random().toString(36).slice(2, 9);

/**
 * Build ready-to-use builder rows for a given strategy.
 * Output row shape:
 * { id, type: 'lc'|'sc'|'lp'|'sp'|'ls'|'ss', qty, days|null, K:null, premium:null, enabled:true }
 *
 * Notes:
 * - Allows qty = 0 (user asked to allow zero volume).
 * - Stock legs ignore days (set to null).
 * - Leaves strike (K) and premium null for manual input later.
 */
export function materializeTemplate(strategyId, env = {}) {
  const template = TEMPLATES[strategyId] || [];
  const cardDays = getCardDays(env);

  const rows = template.map((leg, i) => {
    const t = leg?.type;
    const qty = Number(leg?.qty ?? 1);
    const validType = VALID_LEG_TYPES.includes(t);
    const days = isStock(t) ? null : resolveExpiryToken(leg?.expiry ?? "card", cardDays);

    return {
      id: `${strategyId}-${validType ? t : "x"}-${i}-${uid()}`,
      type: validType ? t : "lc",
      qty: Number.isFinite(qty) ? qty : 1,
      days,
      K: null,
      premium: null,
      enabled: true,
    };
  });

  return rows;
}

/**
 * Optional helper: check if a strategy has a template entry.
 */
export function hasTemplate(strategyId) {
  return !!TEMPLATES[strategyId];
}

export default materializeTemplate;
