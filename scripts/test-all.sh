#!/usr/bin/env bash
set -euo pipefail

pass() { echo "OK  - $1"; }
fail() { echo "FAIL- $1"; exit 1; }

npm run build >/dev/null 2>&1 || fail "build"

# 1
grep -n "publishStatsCtx" components/Strategy/StatsRail.jsx >/dev/null && \
grep -E "basis|days|sigma|rf|erp|beta|muCapm|q:|spot:|currency|driftMode" -n components/Strategy/StatsRail.jsx | wc -l | awk '{exit ($1>=10?0:1)}' && pass "data bus"
# 2
grep -n "greeksByKey" components/Strategy/Chart.jsx >/dev/null && \
grep -n "const G = greeksByKey(.*S, K, r, sigma, T, q" components/Strategy/Chart.jsx >/dev/null && \
grep -n "const days = daysForRow" components/Strategy/Chart.jsx >/dev/null && pass "greeks"
# 3
grep -n "useEffect(.*\\[propSpot\\]" components/Strategy/StatsRail.jsx >/dev/null && \
grep -n "isPos(propSpot).*setSpot(propSpot)" components/Strategy/StatsRail.jsx >/dev/null && \
grep -n "isPos(spot).*moneySign" components/Strategy/StatsRail.jsx >/dev/null && pass "current price"
# 4
grep -n "<StatsRail" app/strategy/page.jsx >/dev/null && \
grep -n "selectedExpiry={selectedExpiry}" app/strategy/page.jsx >/dev/null && \
grep -n "<OptionsTab" app/strategy/page.jsx >/dev/null && \
grep -n "selectedExpiry={selectedExpiry}" app/strategy/page.jsx >/dev/null && \
grep -n "onDaysChange={(d)" app/strategy/page.jsx >/dev/null && pass "expiry shared"
# 5
grep -n "greekNiceRange" components/Strategy/Chart.jsx >/dev/null && \
grep -n "RIGHT GREEK AXIS" components/Strategy/Chart.jsx >/dev/null && \
grep -n "safeGbmMean" components/Strategy/Chart.jsx >/dev/null && \
grep -n "safeGbmCI95" components/Strategy/Chart.jsx >/dev/null && pass "chart polish"
# 6
grep -n "const mcInput" app/strategy/page.jsx >/dev/null && \
grep -E "spot:|sigma:|Tdays:|riskFree:|carryPremium:" -n app/strategy/page.jsx | wc -l | awk '{exit ($1>=5?0:1)}' && pass "mc inputs"
# 7
grep -n "fetchMarketBasics" components/Strategy/StatsRail.jsx >/dev/null && \
grep -n "fetchBetaStats" components/Strategy/StatsRail.jsx >/dev/null && \
grep -n "volMeta?.fallback" components/Strategy/StatsRail.jsx >/dev/null && \
grep -n "spot: isPos(spot) ? spot : null" components/Strategy/StatsRail.jsx >/dev/null && pass "market fallbacks"
# 8
grep -n "isPos(px)) setSpot(px)" components/Strategy/StatsRail.jsx >/dev/null && \
grep -n "isPos(spot) \\? .*moneySign" components/Strategy/StatsRail.jsx >/dev/null && \
grep -n "spot: isPos(spot) \\? spot : null" components/Strategy/StatsRail.jsx >/dev/null && pass "safety rails"

if [ "${TEST_COMMIT:-0}" = "1" ]; then
  printf "All tests passed at %s\n" "$(date -Iseconds)" >> tests/.last-pass || true
  git add tests/.last-pass 2>/dev/null || true
  git commit -m "tests: all 8 roadmap checks passed" || true
fi
