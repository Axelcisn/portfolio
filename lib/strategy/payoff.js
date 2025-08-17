// lib/strategy/payoff.js
// Shim: delegate strategy payoff & break-even helpers to the centralized hub.

export {
  legPayoffAt,
  payoffAt,
  breakpoints,
  suggestBounds,
  findBreakEvens,
} from "../quant";

import {
  legPayoffAt as _legPayoffAt,
  payoffAt as _payoffAt,
  breakpoints as _breakpoints,
  suggestBounds as _suggestBounds,
  findBreakEvens as _findBreakEvens,
} from "../quant";

// Preserve the legacy default export shape
export default {
  payoffAt: _payoffAt,
  legPayoffAt: _legPayoffAt,
  breakpoints: _breakpoints,
  suggestBounds: _suggestBounds,
  findBreakEvens: _findBreakEvens,
};
