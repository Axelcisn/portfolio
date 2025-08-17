# Formulas — Units, Assumptions, and Canonical Definitions

> **Purpose**  
> This document declares the **single source of truth** for every formula used in the app.  
> When you need to change math, update the code in `lib/formulas.js` and reflect any wording here.

---

## Canonical units (always)

- **Spot (S₀), Strike (K), Premium (p):** currency units (same currency throughout).
- **Volatility (σ):** annualized standard deviation **as a decimal** (e.g., 0.24 for 24%).
- **Time (T):** **years**, computed as `days / basis` (basis from context; default 365).
- **Rates:**  
  - **Risk-free (r)** and **Dividend yield (q)** are annual decimals.  
  - **Drift (μ)** depends on selected mode (see below).
- **Quantities:** leg `quantity` is a non-negative count of contracts; **position** is expressed via `pos = "long" | "short"`.

> **Formatting in UI**: money to 2 decimals; percents as decimal×100 with 2 decimals.

---

## Assumptions & measure selection

- **Underlying distribution**: terminal price \( S_T \) is **lognormal**  
  \[
  S_T = S_0 \, \exp\!\big((\mu - \tfrac12\sigma^2)T + \sigma\sqrt{T}\,Z\big), \quad Z\sim \mathcal{N}(0,1).
  \]
- **Measure / drift mode**:
  - **Risk-neutral**: \( \mu = r - q \). Use when pricing off market mid/IVs.
  - **Physical/CAPM**: \( \mu = \mu_{\text{CAPM}} \) from StatsRail context.

Unless explicitly stated, we **ignore financing/discounting** of the upfront premium in expectations shown to users. (Diagnostics below note the implications.)

---

## Standard normal utilities

Let \( \Phi(\cdot) \) be the standard normal CDF. In code, we expose `erf` and `Phi` from `lib/formulas.js`.

Convenient shorthands (with \( v = \sigma\sqrt{T} \)):

\[
d_1(K) = \frac{\ln(S_0/K) + (\mu + \tfrac12\sigma^2)T}{v}, \quad
d_2(K) = d_1(K) - v, \quad
\bar d(K) = \frac{\ln(S_0/K) + (\mu - \tfrac12\sigma^2)T}{v}.
\]

---

## Canonical formulas (and where they’re used)

> **Code source for all formulas**: `lib/formulas.js`  
> Consumers must import from there (no inline math).

### 1) Break-even (price-space)

- **Call**: \( \text{BE} = K + p \)  
- **Put**:  \( \text{BE} = \max(10^{-9},\, K - p) \)

**Used by:**  
- `components/Options/ChainTable.jsx`  
- `components/Strategy/StrategyModal.jsx`

---

### 2) Probability of Profit (PoP)

Define threshold \( a=\text{BE} \) and \( v=\sigma\sqrt{T} \).  
\[
z(a)=\frac{\ln(a/S_0) - (\mu-\tfrac12\sigma^2)T}{v},\quad
\mathbb{P}(S_T\le a)=\Phi\big(z(a)\big),\quad
\mathbb{P}(S_T\ge a)=1-\Phi\big(z(a)\big).
\]

Mapping by leg:
- **Long Call / Short Put:** \( \text{PoP} = \mathbb{P}(S_T \ge a) \)
- **Short Call / Long Put:** \( \text{PoP} = \mathbb{P}(S_T \le a) \)

**Used by:** ChainTable, StrategyModal

---

### 3) Expected *option payoff* (not P&L)

\[
\begin{aligned}
\text{Call: } & \mathbb{E}\big[(S_T - K)^+\big] = S_0 e^{\mu T}\Phi\!\big(d_1(K)\big) - K\,\Phi\!\big(d_2(K)\big) \\
\text{Put: }  & \mathbb{E}\big[(K - S_T)^+\big] = K\,\Phi\!\big(-d_2(K)\big) - S_0 e^{\mu T}\Phi\!\big(-d_1(K)\big)
\end{aligned}
\]

**Used by:** ChainTable, StrategyModal

---

### 4) Expected Profit \( \mathbb{E}[X] \)

Let \( \text{Epay} \) be the expected payoff above and \( p \) the premium paid/received at \( t=0 \).

- **Long:** \( \mathbb{E}[X] = \text{Epay} - p \)
- **Short:** \( \mathbb{E}[X] = p - \text{Epay} \)

*(Variance below is on payoff; adding/subtracting a constant premium does not change variance.)*

**Used by:** ChainTable, StrategyModal

---

### 5) Expected Gain \( \mathbb{E}[X^+] \) and Expected Loss \( \mathbb{E}[X^-] \)

Positive/negative parts are taken on **P&L** at expiry.

#### Long Call
Profit when \( S_T \ge a \) with \( a = K + p \):
\[
\mathbb{E}[X^+] = \mathbb{E}\big[(S_T - a)^+\big] =
S_0 e^{\mu T}\Phi\!\big(d_1(a)\big) - a\,\Phi\!\big(\bar d(a)\big).
\]

#### Long Put
Profit when \( S_T \le a \) with \( a = K - p \) (guard: if \( a \le 0 \Rightarrow \mathbb{E}[X^+]=0 \)):
\[
\mathbb{E}[X^+] = \mathbb{E}\big[(a - S_T)^+\big] =
a\,\Phi\!\big(-\bar d(a)\big) - S_0 e^{\mu T}\Phi\!\big(-d_1(a)\big).
\]

#### Short positions
Short P&L is the negative of long: \( X_{\text{short}}=-X_{\text{long}} \). Hence:
\[
\mathbb{E}[X_{\text{short}}^+] = \mathbb{E}[X_{\text{long}}^-],\quad
\mathbb{E}[X_{\text{short}}^-] = \mathbb{E}[X_{\text{long}}^+].
\]

#### Identity (used in code)
\[
\boxed{\ \mathbb{E}[X] = \mathbb{E}[X^+] - \mathbb{E}[X^-]\ }
\quad\Rightarrow\quad
\mathbb{E}[X^-] = \mathbb{E}[X^+] - \mathbb{E}[X].
\]
We compute \( \mathbb{E}[X^-] \) via this identity (and **report it positive**).

**Used by:** ChainTable (EL/EP pills), StrategyModal (strategy-level EP/EL)

---

### 6) Variance and Standard Deviation of Payoff

Let \( v=\sigma\sqrt{T} \), and define truncated moments:

- Above strike (calls):
  \[
  \mathbb{E}[S_T\,\mathbf{1}_{S_T>K}] = S_0 e^{\mu T}\Phi\!\big(d_1(K)\big),\quad
  \mathbb{E}[S_T^2\,\mathbf{1}_{S_T>K}] = S_0^2 e^{2\mu T + \sigma^2 T}\,\Phi\!\big(d_1(K)+v\big),\\
  \mathbb{P}(S_T>K)=\Phi\!\big(\bar d(K)\big).
  \]
  \[
  \Rightarrow\quad
  \mathbb{E}\!\left[(S_T - K)^+{}^2\right]
  = \mathbb{E}[S_T^2\mathbf{1}_{S_T>K}] - 2K\,\mathbb{E}[S_T\mathbf{1}_{S_T>K}] + K^2\,\mathbb{P}(S_T>K).
  \]

- Below strike (puts):
  \[
  \mathbb{E}[S_T\,\mathbf{1}_{S_T<K}] = S_0 e^{\mu T}\Phi\!\big(-d_1(K)\big),\quad
  \mathbb{E}[S_T^2\,\mathbf{1}_{S_T<K}] = S_0^2 e^{2\mu T + \sigma^2 T}\,\Phi\!\big(-(d_1(K)+v)\big),\\
  \mathbb{P}(S_T<K)=\Phi\!\big(-\bar d(K)\big).
  \]
  \[
  \Rightarrow\quad
  \mathbb{E}\!\left[(K - S_T)^+{}^2\right]
  = K^2\,\mathbb{P}(S_T<K) - 2K\,\mathbb{E}[S_T\mathbf{1}_{S_T<K}] + \mathbb{E}[S_T^2\mathbf{1}_{S_T<K}].
  \]

Then
\[
\text{Var(payoff)} = \mathbb{E}[\text{payoff}^2] - \big(\mathbb{E}[\text{payoff}]\big)^2,
\quad
\text{sdPayoff} = \sqrt{\text{Var(payoff)}}.
\]
*(Variance of P&L equals variance of payoff since the premium is a constant shift.)*

**Used by:** ChainTable (Sharpe), StrategyModal (Sharpe)

---

### 7) Sharpe (per-trade)

\[
\text{Sharpe} = 
\frac{\mathbb{E}[X]}{\text{sdPayoff}}
\]
No annualization is applied here; interpret as a per-trade signal.

**Used by:** ChainTable, StrategyModal

---

## Scaling, composition, and signs

- **Per-leg outputs** (EP \(=\mathbb{E}[X^+]\), EL \(=\mathbb{E}[X^-]\), E[profit], etc.) **scale linearly** by `quantity × contractMultiplier`.  
  In strategy totals, we multiply each leg’s **scalar** by that factor and **sum**.
- **Position sign:** handled by `pos` (`"long"`/`"short"`). Quantities are non-negative counts.
- **Guards:** clamp \( K - p \) to a tiny positive value when forming put thresholds; ignore legs with invalid numeric inputs.

---

## Diagnostics & sanity checks

- **Identity check (always true):**  
  \( \mathbb{E}[X^+] - \mathbb{E}[X^-] \stackrel{!}{=} \mathbb{E}[X] \).  
  UI shows a subtle warning if the numerical difference exceeds a small epsilon.
- **Risk-neutral sanity:** with \( \mu=r-q \) and fairly priced single legs,  
  \( \mathbb{E}[X] \approx 0 \) (ignoring financing/discounting).  
  For multi-leg credit strategies, \( \sum \mathbb{E}[X] \) tends toward **net premium** (after financing); our default display **ignores financing**, so expect “near net premium” only as a heuristic.

---

## Consumer map (keep in sync)

- `components/Options/ChainTable.jsx` — BE, PoP, E[payoff], E[profit], **EP**, **EL**, variance, sd, Sharpe.  
- `components/Strategy/StrategyModal.jsx` — Per-leg metrics (EP/EL/PoP/E[return]/Sharpe) and **strategy-level aggregation**.  
- `components/Strategy/Chart.jsx` *(if present)* — ensure any payoff helpers import from `lib/formulas.js`.  
- `components/Strategy/defs/materializeSeeded.js` — **no formulas** (seeding only).  
- `components/Strategy/statsBus.js` — **no formulas** (event bus).

---

## Where to change math

- **Only edit**: `lib/formulas.js`  
- After changes, verify:  
  1) UI identity \( \mathbb{E}[X^+] - \mathbb{E}[X^-] = \mathbb{E}[X] \) still holds,  
  2) RN sanity still behaves as documented,  
  3) Docs (this page) reflect any updated notation/assumptions.
