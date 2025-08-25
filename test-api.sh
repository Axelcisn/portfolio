#!/usr/bin/env bash
set -euo pipefail

APP="${APP:-$HOME/Documents/GitHub/portfolio}"
cd "$APP"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Detect dev port
PORT=""
lsof -nP -iTCP:3030 -sTCP:LISTEN >/dev/null 2>&1 && PORT=3030
lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1 && PORT="${PORT:-3000}"

if [ -z "${PORT}" ]; then
    echo -e "${RED}No dev server running${NC}"
    echo "Start dev with: npm run dev:3030"
    echo "Or with mock data: USE_MOCK_OPTIONS=true npm run dev:3030"
    exit 1
fi

echo -e "${GREEN}Testing API on port $PORT${NC}\n"

# Test /api/expiries
echo -e "${YELLOW}== Testing /api/expiries?symbol=AAPL ==${NC}"
EXPIRIES=$(curl -fsS "http://127.0.0.1:$PORT/api/expiries?symbol=AAPL" 2>/dev/null || echo "ERROR")

if [ "$EXPIRIES" = "ERROR" ]; then
    echo -e "${RED}✗ Failed to fetch expiries${NC}"
else
    python3 - <<PY
import json
try:
    data = json.loads('''$EXPIRIES''')
    if 'expiries' in data:
        expiries = data['expiries']
        print(f"✓ Found {len(expiries)} expiries")
        print(f"✓ Source: {data.get('source', 'unknown')}")
        print(f"✓ First 3: {expiries[:3] if expiries else 'none'}")
    elif isinstance(data, list):
        print(f"✓ Found {len(data)} expiries (list format)")
        print(f"✓ First 3: {data[:3]}")
    else:
        print(f"✓ Response: {data}")
except Exception as e:
    print(f"Error parsing: {e}")
PY
fi

echo ""

# Test /api/optionChain
echo -e "${YELLOW}== Testing /api/optionChain?symbol=AAPL&window=1 ==${NC}"
CHAIN=$(curl -fsS "http://127.0.0.1:$PORT/api/optionChain?symbol=AAPL&window=1" 2>/dev/null || echo "ERROR")

if [ "$CHAIN" = "ERROR" ]; then
    echo -e "${RED}✗ Failed to fetch option chain${NC}"
else
    python3 - <<PY
import json
try:
    data = json.loads('''$CHAIN''')
    print(f"✓ Expiry: {data.get('expiry', 'none')}")
    print(f"✓ Calls: {len(data.get('calls', []))}")
    print(f"✓ Puts: {len(data.get('puts', []))}")

    # Check if price data is populated
    sample = (data.get('calls') or data.get('puts') or [{}])[0] if data.get('calls') or data.get('puts') else {}
    cols = ['bid', 'mid', 'ask', 'openInterest', 'volume', 'impliedVol']
    has_values = any(sample.get(col) is not None for col in cols)

    if has_values:
        print("✓ Price data: Populated")
        missing = [col for col in cols if col not in sample or sample[col] is None]
        if missing:
            print(f"  Warning: Missing {missing}")
    else:
        print("⚠ Price data: All None (likely mock mode)")

    # Show sample structure
    if sample:
        print(f"✓ Strike prices available: {bool(sample.get('strike'))}")
except Exception as e:
    print(f"Error parsing: {e}")
PY
fi

echo ""

# Test different window sizes
echo -e "${YELLOW}== Testing different window sizes ==${NC}"
for window in 1 2 3 5; do
    RESPONSE=$(curl -fsS "http://127.0.0.1:$PORT/api/optionChain?symbol=AAPL&window=$window" 2>/dev/null || echo "ERROR")
    if [ "$RESPONSE" != "ERROR" ]; then
        python3 - <<PY
import json
try:
    data = json.loads('''$RESPONSE''')
    calls = len(data.get('calls', []))
    puts = len(data.get('puts', []))
    print(f"  Window=$window: {calls} calls, {puts} puts")
except:
    print(f"  Window=$window: Parse error")
PY
    else
        echo -e "  Window=$window: ${RED}Failed${NC}"
    fi
done

echo ""
echo -e "${GREEN}Test complete!${NC}"
