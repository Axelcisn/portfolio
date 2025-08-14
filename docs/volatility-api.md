# Volatility API — Reference

## Endpoints
1) GET /api/volatility
2) GET /api/company/autoFields

---

## 1) GET /api/volatility

Purpose  
Return annualized volatility \( \sigma \) as a decimal per year from either:
- Implied (constant-maturity) options surface, or
- Historical realized volatility computed from daily log returns,
with graceful fallback to the other source if the requested one is unavailable.

### Query Parameters
- symbol (string, required)
- source | volSource = "iv" | "implied" | "live" | "historical" | "hist"  
  • If omitted, default behavior prefers "iv" then falls back to "historical".
- days (integer, optional)  
  • Window length for historical realized vol. Typical choices: 20, 30, 60, 90.
- cmDays (integer, optional; default 30)  
  • Constant-maturity target in calendar days for implied vol selection.
- (Implementation detail) The handler accepts either `source` or `volSource`.

### Response (200 OK always)
---

## Examples & Quick Reference

### Quick rules
- **Symbols**: pass the stock/ETF ticker (e.g., AAPL). Case-insensitive.
- **Source param synonyms**:
  - `source` **or** `volSource` are accepted.
  - Values accepted: `iv`, `implied`, `live`, `historical`, `hist`.
- **Windows & defaults**:
  - `days` (hist window): integer 1–365. Typical choices: 20, 30, 60, 90.  
  - `cmDays` (constant-maturity target for IV): integer, default **30** (calendar days).
- **Units**: All volatilities are **decimals per year** (e.g., `0.3123` = 31.23%).
- **Responses**: Handlers always return **HTTP 200**. On failure you get `{ ok:false, error, errorObj }`.
- **Caching**: short micro-cache (~30–60s) plus `Cache-Control: s-maxage=60, stale-while-revalidate=30`.

### Fallback logic (summary)
- `/api/volatility`  
  1) If `source` asks for **IV** → compute **constant-maturity IV** at `cmDays`.  
  2) If IV unavailable → **historical σ** over `days`.  
  3) If `source` asks for **historical** → steps 1–2 inverted.  
  The chosen path is reported in `meta.sourceUsed` with `meta.fallback = true` when a fallback occurred.

- `/api/company/autoFields`  
  Prefers **IV @ constant-maturity** then falls back to **historical**.  
  Returns both `ivImplied` and `ivHist` when available; the chosen value is `sigmaAnnual` (and `iv` alias).

### Example requests

```bash
# 1) Constant-maturity implied vol (target 30 calendar days, default)
curl -sS 'https://<your-app>/api/volatility?symbol=AAPL&source=iv'

# 2) Same as above but explicit 45d constant maturity
curl -sS 'https://<your-app>/api/volatility?symbol=MSFT&source=implied&cmDays=45'

# 3) Historical realized vol, 60-trading-day window
curl -sS 'https://<your-app>/api/volatility?symbol=NVDA&source=historical&days=60'

# 4) Auto bundle for UI (spot, currency, beta, 52W, + best-effort σ)
curl -sS 'https://<your-app>/api/company/autoFields?symbol=AMZN&volSource=auto&days=30&cmDays=30'
