# Options Metrics One-Pager

> Formulas + assumptions behind **E[Profit]**, **E[Loss]**, **P(Profit)**, **E[Return]**, and **Sharpe** at leg and strategy level. Applies to vanilla European calls/puts.

## Notation & Assumptions

- Underlying spot: \(S_0\). Strike: \(K\). Time to expiry (years): \(T\).
- Volatility: \(\sigma\). Risk-free: \(r\). Dividend yield: \(q\).
- Drift mode:
  - **Risk-neutral**: \(\mu = r - q\).
  - **CAPM** (or “physical”): \(\mu = \mu_{\text{CAPM}}\).
- Lognormal model: \(\ln S_T \sim \mathcal N\!\big(\ln S_0 + (\mu - \tfrac12\sigma^2)T,\; \sigma^2 T\big)\).
- Convenience: \(v=\sigma\sqrt{T}\), \(\Phi(\cdot)\) is the standard normal CDF.
- Contract multiplier \(M\) (equity options default **100**) and **Qty** \(Q\) (signed; short < 0).
- Premium \(p \ge 0\) is entered per contract (mid if available, else last).

## Break-Even (per leg)

- **Call (long payoff −p)**: \( \text{BE} = K + p \)
- **Put  (long payoff −p)**: \( \text{BE} = \max(0,\; K - p) \)

We use BE only for **P(Profit)** thresholds and chart markers.

## Probability of Profit (PoP)

Let \(a\) be the P&L threshold to break even at expiry:

- Long **call** needs \(S_T > K + p\) → \(a = K + p\).
- Long **put** needs \(S_T < K - p\) → \(a = K - p\) (if \(a \le 0\), PoP for long put at BE is 0).
- For shorts, inequality flips.

With \(z(a)=\dfrac{\ln(a/S_0) - (\mu - \tfrac12\sigma^2)T}{v}\):
- \( \Pr[S_T > a] = 1 - \Phi\big(z(a)\big) \)
- \( \Pr[S_T < a] = \Phi\big(z(a)\big) \)

We pick the appropriate side based on leg type + direction.

## Expected Payoff \(E[\text{payoff}]\)

Define
\[
d_1(K)=\frac{\ln(S_0/K)+(\mu+\tfrac12\sigma^2)T}{v},\quad
\bar d(K)=\frac{\ln(S_0/K)+(\mu-\tfrac12\sigma^2)T}{v},\quad
\text{and } S_0 e^{\mu T} = E[S_T].
\]

- **Call**: \( E[(S_T-K)^+] = S_0 e^{\mu T}\,\Phi(d_1(K)) - K\,\Phi(\bar d(K)) \)
- **Put**:  \( E[(K-S_T)^+] = K\,\Phi(-\bar d(K)) - S_0 e^{\mu T}\,\Phi(-d_1(K)) \)

## Expected Profit \(E[X]\), Expected Gain \(E[X^+]\), Expected Loss \(E[X^-]\)

- P&L at expiry for a **long** leg: \(X = \text{payoff} - p\).
- \(E[X] = E[\text{payoff}] - p\).
- **Expected gain (reported positive)** \( \mathrm{EP} = E[X^+] \).
- **Expected loss (reported positive)** \( \mathrm{EL} = E[X^-] \).
- Identity: \(E[X] = \mathrm{EP} - \mathrm{EL}\).

Closed-form for \(E[X^+]\) (long legs) via shifting the strike to the BE threshold \(a\):

- **Long Call**: \(a = K + p\).
  \[
  \mathrm{EP}_{\text{long}} = E[(S_T-a)^+] = S_0 e^{\mu T}\,\Phi(d_1(a)) - a\,\Phi(\bar d(a))
  \]
- **Long Put**: \(a = K - p\).
  \[
  \mathrm{EP}_{\text{long}} =
  \begin{cases}
    a\,\Phi(-\bar d(a)) - S_0 e^{\mu T}\,\Phi(-d_1(a)), & a>0\\[4pt]
    0, & a\le 0
  \end{cases}
  \]

Then
\[
\mathrm{EL}_{\text{long}} = \mathrm{EP}_{\text{long}} - E[X].
\]

**Short legs**: \(X_{\text{short}} = -X_{\text{long}}\).
So \( \mathrm{EP}_{\text{short}} = \mathrm{EL}_{\text{long}},\quad \mathrm{EL}_{\text{short}} = \mathrm{EP}_{\text{long}},\quad E[X]_{\text{short}}=-E[X]_{\text{long}}.\)

## Variance & Sharpe

We use payoff variance (identical to P&L variance since premium is constant):

Let \(S_0^2 e^{2\mu T+\sigma^2 T}\) be \(E[S_T^2]\).
With truncated moments (above/below \(K\)):

- **Call**:
  \[
  E[\text{payoff}^2] = E\big[(S_T-K)^+\big]^2\ \text{via}\ 
  \begin{aligned}
   E[S_T\,\mathbf 1_{S_T>K}] &= S_0 e^{\mu T}\Phi(d_1(K))\\
   E[S_T^2\,\mathbf 1_{S_T>K}] &= S_0^2 e^{2\mu T+\sigma^2 T}\,\Phi(d_1(K)+v)\\
   P(S_T>K) &= \Phi(\bar d(K))
  \end{aligned}
  \]
  \[
  E[\text{payoff}^2] = E[S_T^2\,\mathbf 1_{>K}] - 2K\,E[S_T\,\mathbf 1_{>K}] + K^2 P(S_T>K)
  \]
- **Put** (analogous, with \(<K\)).

Then \( \mathrm{Var}(\text{payoff}) = E[\text{payoff}^2] - (E[\text{payoff}])^2 \),  
\( \mathrm{SD} = \sqrt{\mathrm{Var}} \),  
**Sharpe** \(= \dfrac{E[X]}{\mathrm{SD}}\).

## Strategy Aggregation

For each leg \(i\) with Qty \(Q_i\) and multiplier \(M_i\):
- Scale: \( \text{scale}_i = Q_i \times M_i \).
- **Totals** (EP, EL, \(E[X]\)) **sum linearly** over legs:
  \[
  \mathrm{EP}_{\Sigma}=\sum_i \mathrm{EP}_i\text{scale}_i,\quad
  \mathrm{EL}_{\Sigma}=\sum_i \mathrm{EL}_i\text{scale}_i,\quad
  E[X]_{\Sigma} = \sum_i E[X]_i\text{scale}_i
  \]
- **E[Return]** at strategy level uses cash flow denominator:
  \[
  \mathrm{Denom} = \left|\sum_i (\pm p_i)\,Q_i M_i\right|
  \]
  (debit > 0, credit < 0). If `Denom = 0`, return is **N/A**.  
  \( E[\text{Return}] = E[X]_{\Sigma} / \mathrm{Denom} \).
- **Sharpe (strategy)**: we use sum-of-legs variance only if needed; by default we report **sum-of-legs Sharpe** as a heuristic. Exact portfolio Sharpe requires joint distribution (correlation = 1 only for identical strikes/expiries). For v1 we expose additive Sharpe; Monte-Carlo can refine later.

## Risk-Neutral Sanity

With **risk-neutral** \(\mu = r-q\):
\[
E[\text{payoff}] = p\,e^{rT}\quad\Rightarrow\quad
E[X]=E[\text{payoff}] - p \approx p\,(e^{rT}-1).
\]
Since \(E[X] = \mathrm{EP} - \mathrm{EL}\), we flag if
\[
\big|\mathrm{EP}-\mathrm{EL}-p\,(e^{rT}-1)\big| > \varepsilon
\]
(small \(\varepsilon\) tolerance). In the chain UI we compare per-row; in the strategy modal we compare the totals.

## Display & Edge Cases

- If a leg’s premium is blank → treat as **0**, label **N/A** where needed.
- Put BE when \(K-p \le 0\): BE shown as “—”; EP_long for put uses 0 threshold.
- Contract multiplier defaults to **100** (equities), configurable per row.
- Confidence band and “MC(S)” under drift \(\mu\):
  - \(E[S_T]=S_0 e^{\mu T}\)
  - 95% CI for price: \(\exp\!\big(m \pm 1.95996\,v\big)\), \(m=\ln S_0 + (\mu - \tfrac12\sigma^2)T\).
