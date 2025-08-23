#!/usr/bin/env bash
set -euo pipefail

. "$(dirname "$0")/common.sh"

PORT="$(ibkr_detect_port)"
BASE="https://localhost:${PORT}/v1/api"
echo "[using] $BASE"

tickle() { curl -sk -X POST --data "" "$BASE/tickle" >/dev/null || true; }
status() { curl -sk -X POST --data "" "$BASE/iserver/auth/status" || true; }
reauth() { curl -sk -X POST --data "" "$BASE/iserver/reauthenticate" >/dev/null || true; }

tickle
S="$(status)"; echo "[status] $S"
AUTH="$(printf '%s' "$S" | tr -d '\n' | sed -n 's/.*"authenticated":\([^,}]*\).*/\1/p')"
CONN="$(printf '%s' "$S" | tr -d '\n' | sed -n 's/.*"connected":\([^,}]*\).*/\1/p')"

if [ "$AUTH" != "true" ] || [ "$CONN" != "true" ]; then
  echo "[action] Opening login. If a popup shows 'Existing Session Detected', click 'Reconnect This Session'."
  open "https://localhost:${PORT}/" >/dev/null 2>&1 || true
fi

for i in {1..60}; do
  reauth
  sleep 2
  S="$(status)"; echo "[status] $S"
  AUTH="$(printf '%s' "$S" | tr -d '\n' | sed -n 's/.*"authenticated":\([^,}]*\).*/\1/p')"
  CONN="$(printf '%s' "$S" | tr -d '\n' | sed -n 's/.*"connected":\([^,}]*\).*/\1/p')"
  if [ "$AUTH" = "true" ] && [ "$CONN" = "true" ]; then break; fi
done

echo "--- accounts"
curl -sk "$BASE/iserver/accounts" | head -c 1200; echo
