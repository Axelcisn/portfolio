#!/usr/bin/env bash
set -euo pipefail

# Use saved port or autodetect
PORT="$(cat /tmp/ibkr_gateway_port 2>/dev/null || true)"
if [ -z "${PORT:-}" ]; then
  if lsof -nP -iTCP:5001 -sTCP:LISTEN >/dev/null 2>&1; then PORT=5001
  elif lsof -nP -iTCP:5000 -sTCP:LISTEN >/dev/null 2>&1; then PORT=5000
  else PORT=5001; fi
fi
BASE="https://localhost:${PORT}/v1/api"
echo "[using] $BASE"

# Open login (switch to **Live** in the toggle before logging in)
command -v open >/dev/null 2>&1 && open "https://localhost:${PORT}/"

# Kick off bridge and poll until connected
attempt() {
  curl -sk -X POST --data "" "$BASE/tickle" >/dev/null || true
  curl -sk -X POST --data "" "$BASE/iserver/reauthenticate" >/dev/null || true
}

attempt
echo "[wait] establishing LIVE brokerage bridge..."
for i in {1..120}; do
  RESP="$(curl -sk -X POST --data "" "$BASE/iserver/auth/status" || true)"
  echo "$RESP"
  if echo "$RESP" | grep -q '"authenticated":true' && echo "$RESP" | grep -q '"connected":true'; then
    echo "[ok] LIVE bridge ready"
    break
  fi
  # Nudge every ~10s
  if (( i % 10 == 0 )); then attempt; fi
  sleep 2
done

echo "--- accounts"
curl -sk "$BASE/iserver/accounts" | head -c 1200; echo
echo "--- AAPL search"
curl -skG --data-urlencode "symbol=AAPL" "$BASE/iserver/secdef/search" | head -c 1200; echo
