// lib/quant/index.js
// Barrel file for the centralized quant math.
// Consumers can now do:
//   import { breakEven, expectedProfit } from "lib/quant";
// or
//   import quant from "lib/quant";  // quant.breakEven(...)

export * from "./formulas";

import formulas from "./formulas";
export default formulas;
export { formulas as quant }; // optional named alias if you prefer: import { quant } from "lib/quant";
