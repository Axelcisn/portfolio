// tests/rowsToApiLegs.spec.mjs
// Minimal smoke test for components/Strategy/utils/rowsToApiLegs.js
// Run: node tests/rowsToApiLegs.spec.mjs

import assert from "node:assert/strict";
import rowsToApiLegs from "../components/Strategy/utils/rowsToApiLegs.js";

function by(type, side, legs) {
  return legs.find(l => l.type === type && l.side === side);
}

(function run() {
  const legs = rowsToApiLegs([
    { type: "lc", K: 100, qty: 2, premium: 3.00 },      // long call
    { type: "sc", K: 110, qty: 1, premium: 1.50 },      // short call
    { type: "lp", strike: 100, premium: 2.40 },         // long put (qty default 1)
    { type: "sp", K: 90, premium: 1.20, qty: -5 },      // short put (qty clamped to 0)
    { type: "ls", price: 95, qty: 4 },                  // long stock (price via price)
    { type: "ss", premium: 90, qty: 1 },                // short stock (price via premium fallback)
    { type: "??", K: 123, qty: 9, premium: 9.99 },      // unknown -> ignored
  ]);

  // shape checks
  assert.ok(Array.isArray(legs), "mapper returns array");
  assert.equal(legs.length, 6, "unknown rows are ignored");

  // long call
  let L = by("call", "long", legs);
  assert.ok(L, "long call present");
  assert.equal(L.qty, 2);
  assert.equal(L.strike, 100);
  assert.equal(L.premium, 3.00);

  // short call
  L = by("call", "short", legs);
  assert.ok(L, "short call present");
  assert.equal(L.qty, 1);
  assert.equal(L.strike, 110);
  assert.equal(L.premium, 1.50);

  // long put (qty default 1, strike from 'strike')
  L = by("put", "long", legs);
  assert.ok(L, "long put present");
  assert.equal(L.qty, 1, "qty defaults to 1");
  assert.equal(L.strike, 100);
  assert.equal(L.premium, 2.40);

  // short put (qty clamped to 0)
  L = by("put", "short", legs);
  assert.ok(L, "short put present");
  assert.equal(L.qty, 0, "negative qty is clamped to 0");
  assert.equal(L.strike, 90);
  assert.equal(L.premium, 1.20);

  // long stock (price from price)
  L = by("stock", "long", legs);
  assert.ok(L, "long stock present");
  assert.equal(L.qty, 4);
  assert.equal(L.price, 95);

  // short stock (price from premium fallback)
  L = by("stock", "short", legs);
  assert.ok(L, "short stock present");
  assert.equal(L.qty, 1);
  assert.equal(L.price, 90);

  console.log("✅ rowsToApiLegs: all assertions passed");
})();
