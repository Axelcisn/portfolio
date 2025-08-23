#!/usr/bin/env bash
set -euo pipefail

. "$(dirname "$0")/common.sh"

BASE="$(ibkr_base_url)"
echo "[using] $BASE"

# Keepalive
curl -sk -X POST --data "" "$BASE/tickle" >/dev/null || true

# Check current status
STATUS="$(ibkr_auth_status "$BASE")"
echo "[status] $STATUS"
AUTH="$(ibkr_is_authenticated "$STATUS")"
CONN="$(ibkr_is_connected "$STATUS")"

# If not connected, try reauthenticate and poll
if [ "$AUTH" != "true" ] || [ "$CONN" != "true" ]; then
  echo "[reauth] triggering..."
  curl -sk -X POST --data "" "$BASE/iserver/reauthenticate" >/dev/null || true
  for i in {1..30}; do
    sleep 1
    STATUS="$(ibkr_auth_status "$BASE")"
    echo "[status] $STATUS"
    AUTH="$(ibkr_is_authenticated "$STATUS")"
    CONN="$(ibkr_is_connected "$STATUS")"
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
