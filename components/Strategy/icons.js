// components/Strategy/icons.js
"use client";
import React from "react";

/* Simple geometric icons (clean, legible at small sizes) */
const CircleArrowUp = (props) => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" {...props}>
    <circle cx="12" cy="12" r="10" stroke="currentColor" opacity=".45"/>
    <path d="M12 16V8m0 0l-4 4m4-4l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const CircleArrowDown = (props) => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" {...props}>
    <circle cx="12" cy="12" r="10" stroke="currentColor" opacity=".45"/>
    <path d="M12 8v8m0 0l4-4m-4 4l-4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const BalanceIcon = (props) => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" {...props}>
    <circle cx="12" cy="12" r="10" stroke="currentColor" opacity=".45"/>
    <path d="M7 13a3 3 0 006 0M9 8l3-3 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const CondorIcon = (props) => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" {...props}>
    <rect x="4" y="5" width="16" height="14" rx="3" stroke="currentColor" opacity=".45"/>
    <path d="M6 16c3-5 9-5 12 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
  </svg>
);
const ButterflyIcon = (props) => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" {...props}>
    <path d="M12 12c3.5-5 7-4 7-1.5 0 2.5-3.3 4.5-7 4.5s-7-2-7-4.5C5 8 8.5 7 12 12z" stroke="currentColor" strokeWidth="1.4" fill="none"/>
  </svg>
);

/* Strategy catalog
   NOTE: 'isMulti' marks multi-leg strategies. Some advanced (e.g., call butterfly)
   need multiple strikes of the same option type and are NOT supported by the base
   4-leg chart; those are flagged 'disabled' for now. */
export const ALL_STRATEGIES = [
  // Single-leg
  { id: "long-call", name: "Long Call", direction: "Bullish", isMulti: false, icon: CircleArrowUp, legs: [{ position: "Long Call", strike: null, volume: 1, premium: null }], metrics: {} },
  { id: "long-put",  name: "Long Put",  direction: "Bearish", isMulti: false, icon: CircleArrowDown, legs: [{ position: "Long Put",  strike: null, volume: 1, premium: null }], metrics: {} },
  { id: "short-call", name: "Short Call", direction: "Bearish", isMulti: false, icon: CircleArrowDown, legs: [{ position: "Short Call", strike: null, volume: 1, premium: null }], metrics: {} },
  { id: "short-put",  name: "Short Put",  direction: "Bullish", isMulti: false, icon: CircleArrowUp,   legs: [{ position: "Short Put",  strike: null, volume: 1, premium: null }], metrics: {} },
  { id: "protective-put", name: "Protective Put", direction: "Bearish", isMulti: false, icon: CircleArrowDown, legs: [{ position: "Long Put", strike: null, volume: 1, premium: null }], metrics: {} },
  { id: "leaps", name: "LEAPS", direction: "Bullish", isMulti: false, icon: CircleArrowUp, legs: [{ position: "Long Call", strike: null, volume: 1, premium: null }], metrics: {} },

  // Verticals
  { id: "bear-call-spread", name: "Bear Call Spread", direction: "Bearish", isMulti: true, icon: BalanceIcon, legs: [
      { position: "Short Call", strike: null, volume: 1, premium: null },
      { position: "Long Call",  strike: null, volume: 1, premium: null },
    ], metrics: {} },
  { id: "bull-put-spread", name: "Bull Put Spread", direction: "Bullish", isMulti: true, icon: BalanceIcon, legs: [
      { position: "Short Put", strike: null, volume: 1, premium: null },
      { position: "Long Put",  strike: null, volume: 1, premium: null },
    ], metrics: {} },
  { id: "bear-put-spread", name: "Bear Put Spread", direction: "Bearish", isMulti: true, icon: BalanceIcon, legs: [
      { position: "Long Put",  strike: null, volume: 1, premium: null },
      { position: "Short Put", strike: null, volume: 1, premium: null },
    ], metrics: {} },

  // Straddles & Strangles
  { id: "long-straddle", name: "Long Straddle", direction: "Neutral", isMulti: true, icon: BalanceIcon, legs: [
      { position: "Long Call", strike: null, volume: 1, premium: null },
      { position: "Long Put",  strike: null, volume: 1, premium: null },
    ], metrics: {} },
  { id: "short-straddle", name: "Short Straddle", direction: "Neutral", isMulti: true, icon: BalanceIcon, legs: [
      { position: "Short Call", strike: null, volume: 1, premium: null },
      { position: "Short Put",  strike: null, volume: 1, premium: null },
    ], metrics: {} },
  { id: "long-strangle", name: "Long Strangle", direction: "Neutral", isMulti: true, icon: BalanceIcon, legs: [
      { position: "Long Call", strike: null, volume: 1, premium: null },
      { position: "Long Put",  strike: null, volume: 1, premium: null },
    ], metrics: {} },
  { id: "short-strangle", name: "Short Strangle", direction: "Neutral", isMulti: true, icon: BalanceIcon, legs: [
      { position: "Short Call", strike: null, volume: 1, premium: null },
      { position: "Short Put",  strike: null, volume: 1, premium: null },
    ], metrics: {} },

  // Calendars & diagonals (same T in this version; UI only)
  { id: "call-calendar", name: "Call Calendar", direction: "Neutral", isMulti: true, icon: BalanceIcon, legs: [
      { position: "Long Call", strike: null, volume: 1, premium: null },
      { position: "Short Call", strike: null, volume: 1, premium: null },
    ], metrics: {} },
  { id: "put-calendar", name: "Put Calendar", direction: "Neutral", isMulti: true, icon: BalanceIcon, legs: [
      { position: "Long Put", strike: null, volume: 1, premium: null },
      { position: "Short Put", strike: null, volume: 1, premium: null },
    ], metrics: {} },
  { id: "call-diagonal", name: "Call Diagonal", direction: "Bullish", isMulti: true, icon: CircleArrowUp, legs: [
      { position: "Long Call", strike: null, volume: 1, premium: null },
      { position: "Short Call", strike: null, volume: 1, premium: null },
    ], metrics: {} },
  { id: "put-diagonal", name: "Put Diagonal", direction: "Bearish", isMulti: true, icon: CircleArrowDown, legs: [
      { position: "Long Put", strike: null, volume: 1, premium: null },
      { position: "Short Put", strike: null, volume: 1, premium: null },
    ], metrics: {} },

  // Condors & butterflies (iron versions supported)
  { id: "iron-condor", name: "Iron Condor", direction: "Neutral", isMulti: true, icon: CondorIcon, legs: [
      { position: "Short Call", strike: null, volume: 1, premium: null },
      { position: "Long  Call", strike: null, volume: 1, premium: null }, // label typo avoided in UI mapping
      { position: "Short Put",  strike: null, volume: 1, premium: null },
      { position: "Long  Put",  strike: null, volume: 1, premium: null },
    ].map((x)=>({ ...x, position: x.position.replace("  "," ") })), metrics: {} },
  { id: "iron-butterfly", name: "Iron Butterfly", direction: "Neutral", isMulti: true, icon: ButterflyIcon, legs: [
      { position: "Short Call", strike: null, volume: 1, premium: null },
      { position: "Short Put",  strike: null, volume: 1, premium: null },
      { position: "Long Call",  strike: null, volume: 1, premium: null },
      { position: "Long Put",   strike: null, volume: 1, premium: null },
    ], metrics: {} },

  // Ratios/backspreads and complex butterflies (disabled in v1 due to single‑strike limitation)
  { id: "call-butterfly", name: "Call Butterfly", direction: "Neutral", isMulti: true, icon: ButterflyIcon, legs: [], disabled: true },
  { id: "put-butterfly",  name: "Put Butterfly",  direction: "Neutral", isMulti: true, icon: ButterflyIcon, legs: [], disabled: true },
  { id: "reverse-butterfly", name: "Reverse Butterfly", direction: "Neutral", isMulti: true, icon: ButterflyIcon, legs: [], disabled: true },
  { id: "reverse-condor", name: "Reverse Condor", direction: "Neutral", isMulti: true, icon: CondorIcon, legs: [], disabled: true },
  { id: "call-ratio", name: "Call Ratio", direction: "Bullish", isMulti: true, icon: CircleArrowUp, legs: [], disabled: true },
  { id: "put-ratio",  name: "Put Ratio",  direction: "Bearish", isMulti: true, icon: CircleArrowDown, legs: [], disabled: true },
  { id: "call-backspread", name: "Call Backspread", direction: "Bullish", isMulti: true, icon: CircleArrowUp, legs: [], disabled: true },
  { id: "put-backspread",  name: "Put Backspread",  direction: "Bearish", isMulti: true, icon: CircleArrowDown, legs: [], disabled: true },

  // Other
  { id: "covered-call", name: "Covered Call", direction: "Neutral", isMulti: true, icon: BalanceIcon, legs: [{ position: "Short Call", strike: null, volume: 1, premium: null }], metrics: {} },
  { id: "covered-put",  name: "Covered Put",  direction: "Neutral", isMulti: true, icon: BalanceIcon, legs: [{ position: "Short Put",  strike: null, volume: 1, premium: null }], metrics: {} },
  { id: "collar",       name: "Collar",       direction: "Neutral", isMulti: true, icon: BalanceIcon, legs: [
      { position: "Long Put",  strike: null, volume: 1, premium: null },
      { position: "Short Call", strike: null, volume: 1, premium: null },
    ], metrics: {} },
  { id: "strap",        name: "Strap",        direction: "Bullish", isMulti: true, icon: CircleArrowUp, legs: [
      { position: "Long Call", strike: null, volume: 2, premium: null },
      { position: "Long Put",  strike: null, volume: 1, premium: null },
    ], metrics: {} },
  { id: "long-box",     name: "Long Box",     direction: "Neutral", isMulti: true, icon: BalanceIcon, legs: [], disabled: true },
  { id: "short-box",    name: "Short Box",    direction: "Neutral", isMulti: true, icon: BalanceIcon, legs: [], disabled: true },
  { id: "reversal",     name: "Reversal",     direction: "Neutral", isMulti: true, icon: BalanceIcon, legs: [], disabled: true },
  { id: "stock-repair", name: "Stock Repair", direction: "Bullish", isMulti: true, icon: CircleArrowUp, legs: [], disabled: true },
];

export { CircleArrowUp, CircleArrowDown, BalanceIcon, CondorIcon, ButterflyIcon };
