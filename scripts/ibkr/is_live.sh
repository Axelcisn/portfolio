#!/usr/bin/env bash
set -euo pipefail

PORT="$(cat /tmp/ibkr_gateway_port 2>/dev/null || echo 5001)"
BASE="https://localhost:${PORT}/v1/api"
echo "[using] $BASE"

# Keepalive
curl -sk -X POST --data "" "$BASE/tickle" >/dev/null || true

# Check current status
STATUS="$(curl -sk -X POST --data "" "$BASE/iserver/auth/status" || true)"
echo "[status] $STATUS"
AUTH="$(printf '%s' "$STATUS" | tr -d '\n' | sed -n 's/.*"authenticated":\([^,}]*\).*/\1/p')"
CONN="$(printf '%s' "$STATUS" | tr -d '\n' | sed -n 's/.*"connected":\([^,}]*\).*/\1/p')"

# If not connected, try reauthenticate and poll
if [ "$AUTH" != "true" ] || [ "$CONN" != "true" ]; then
  echo "[reauth] triggering..."
  curl -sk -X POST --data "" "$BASE/iserver/reauthenticate" >/dev/null || true
  for i in {1..30}; do
    sleep 1
    STATUS="$(curl -sk -X POST --data "" "$BASE/iserver/auth/status" || true)"
    echo "[status] $STATUS"
    AUTH="$(printf '%s' "$STATUS" | tr -d '\n' | sed -n 's/.*"authenticated":\([^,}]*\).*/\1/p')"
    CONN="$(printf '%s' "$STATUS" | tr -d '\n' | sed -n 's/.*"connected":\([^,}]*\).*/\1/p')"
    if [ "$AUTH" = "true" ] && [ "$CONN" = "true" ]; then break; fi
  done
fi

# Accounts with HTTP code captured
RESP="$(curl -sk -w '\nHTTP %{http_code}\n' "$BASE/iserver/accounts" || true)"
HTTP_CODE="$(printf '%s\n' "$RESP" | tail -n1 | awk '{print $2}')"
BODY="$(printf '%s\n' "$RESP" | sed '$d')"
echo "[accounts] HTTP $HTTP_CODE"

# Extract isPaper if present
ISPAPER="$(printf '%s' "$BODY" | tr -d '\n' | sed -n 's/.*"isPaper":\([^,}]*\).*/\1/p')"
if [ -n "$ISPAPER" ]; then
  echo "isPaper:$ISPAPER"
else
  echo "isPaper:unknown (no field in response)"
fi
