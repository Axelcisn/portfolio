# Centralized Formulas — Tracking Checklist

> **Objective:** move *all* pricing/metrics math into a **single source file** and link every consumer to it.

---

## Meta

- **Branch:** `feat/centralized-formulas` ☐
- **Feature flag present:** `<repo-root>/featureFlags.json` → `centralizedFormulas: true` ☑
- **Canonical formulas file:** `<repo-root>/lib/formulas.js` ☐
- **Units & assumptions documented:** `docs/formulas.md` ☐

---

## Phases

### Phase 0 — Preparation
- [x] Create working branch (record name above)
- [x] Add feature flag file: `featureFlags.json`
- [ ] Update docs: `docs/formulas.md` with units, assumptions, μ mode (risk-neutral vs physical)

### Phase 1 — Create the single formulas file
- [ ] New file: `lib/formulas.js`
  - [ ] Export **only** pure, unit-tested functions (JSDoc each: inputs, units, equations, refs):
    - `erf`, `Phi`
    - `breakEven({ type, K, premium })`
    - `probOfProfit({ type, pos, S0, K, premium, sigma, T, drift })`
    - `expectedPayoff({ type, S0, K, sigma, T, drift })`
    - `expectedProfit({ type, pos, premium, ... })`  *(E[X])*
    - `expectedPositive({ type, pos, ... })` *(E[X⁺])*
    - `expectedNegative({ type, pos, ... })` *(E[X⁻], reported positive)*
    - `variancePayoff({ type, ... })` and `stdevPayoff(...)`
    - `sharpe({ expProfit, stdev })`
  - [ ] **Compatibility aliases** (for smoother migration):  
        `expectedGain → expectedPositive`, `expectedLoss → expectedNegative`
  - [ ] “**Used by**” section at top listing consumer paths (keep updated)

- [ ] Optional tests (recommended):
  - [ ] `__tests__/formulas.test.js` — smoke & identity checks:
    - `E[X] = E[X⁺] – E[X⁻]`
    - Risk-neutral sanity: `E[X] ≈ ±premium` (financing ignored)

### Phase 2 — Link consumers to central file (no local math left)
> For each path below: **Replace** local math with imports from `lib/formulas.js`.  
> If needed, keep a feature-flag fallback while verifying parity.

- [ ] `components/Options/ChainTable.jsx`  
  Action: Replace local `erf`, `Phi`, `metricsForOption`.  
  Wire metrics: BE, PoP, **EP (E[X⁺])**, **EL (E[X⁻])**, E[Return], Sharpe.  
  Remove duplicate math blocks once verified.

- [ ] `components/Strategy/StrategyModal.jsx`  
  Action: Replace per-leg calculator/aggregator to call `lib/formulas.js`.  
  Scale per-leg by `qty × contractSize` before summing totals.  
  Show risk-neutral note: **EP – EL ≈ Net Premium** diagnostic.

- [ ] `components/Strategy/Chart.jsx` *(if present)*  
  Action: Review & replace any payoff/metric helpers with imports only.

- [ ] `components/Strategy/defs/materializeSeeded.js`  
  Action: Review (seeding only). Ensure **no** pricing math duplicated here.

- [ ] `components/Strategy/statsBus.js`  
  Action: Review. Should remain an event bus (no formulas).

- [ ] `components/Options/*` (others, if any)  
  Action: Search for `erf(`, `Phi(`, `break-even`, `PoP`, `Sharpe`, `expected*` and replace.

- [ ] `app/api/*` or `pages/api/*` (if present)  
  Action: Ensure server routes import the central formulas (no re-implementation).

### Phase 3 — Cleanup & verification
- [ ] Delete local math snippets after linkage (see **Removals** below)
- [ ] Run equivalence checks on a few strikes/expiries:
  - [ ] Long/short call & put: BE, PoP, EP, EL, Sharpe within tolerance
- [ ] Update `docs/formulas.md`:
  - [ ] Final list of formulas
  - [ ] Where each is used (paths)
  - [ ] Any deviations / known limitations
- [ ] Keep this checklist updated (dates, commit hashes)

---

## Paths to audit & link

> Tick when each path imports **exclusively** from `lib/formulas.js`.

- [ ] `components/Options/ChainTable.jsx`
- [ ] `components/Strategy/StrategyModal.jsx`
- [ ] `components/Strategy/Chart.jsx` *(if exists)*
- [ ] `components/Strategy/defs/materializeSeeded.js`
- [ ] `components/Strategy/statsBus.js` *(sanity: no formulas)*
- [ ] `app/api/*` *(or)* `pages/api/*` *(if exists)*
- [ ] `docs/formulas.md` *(docs only)*
- [ ] *(Add discovered paths as you search)*

**Use search hints:**  
`erf(` | `Phi(` | `expected` | `E[Profit]` | `E[Loss]` | `Sharpe` | `break-even` | `PoP` | `BE` | `Epay` | `payoff` | `variance` | `sdPay` | `sigma * Math.sqrt(T)`

---

## Formula → Consumers map (keep updated)

| Formula (lib/formulas.js) | Used in (paths) | Status |
|---|---|---|
| `breakEven` | ChainTable, StrategyModal | ☐ |
| `probOfProfit` | ChainTable, StrategyModal | ☐ |
| `expectedPayoff` | ChainTable, StrategyModal | ☐ |
| `expectedProfit` | ChainTable, StrategyModal | ☐ |
| `expectedPositive` *(alias: expectedGain)* | ChainTable, StrategyModal | ☐ |
| `expectedNegative` *(alias: expectedLoss)* | ChainTable, StrategyModal | ☐ |
| `variancePayoff` / `stdevPayoff` | ChainTable, StrategyModal | ☐ |
| `sharpe` | ChainTable, StrategyModal | ☐ |
| `erf`, `Phi` | ChainTable (via import), StrategyModal | ☐ |

---

## Removals (after linkage is verified)

- [ ] Inline `erf`, `Phi` implementations in any component
- [ ] `metricsForOption` (and similar ad-hoc calculators) inside:
  - [ ] `components/Options/ChainTable.jsx`
  - [ ] `components/Strategy/*` (search & remove duplicates)
- [ ] Any unused math helpers discovered by search

> Only mark these as removed **after** you confirm all consumers import from `lib/formulas.js` **and** UI values match screenshots.
