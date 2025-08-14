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
