#!/usr/bin/env bash
set -euo pipefail


. "$(dirname "$0")/common.sh"

BASE="$(ibkr_base_url)"
PORT="$(ibkr_detect_port)"
echo "[using] $BASE"

tickle() { curl -sk -X POST --data "" "$BASE/tickle" >/dev/null || true; }
status() { ibkr_auth_status "$BASE"; }
reauth() { curl -sk -X POST --data "" "$BASE/iserver/reauthenticate" >/dev/null || true; }

tickle
S="$(status)"; echo "[status] $S"
AUTH="$(ibkr_is_authenticated "$S")"
CONN="$(ibkr_is_connected "$S")"

if [ "$AUTH" != "true" ] || [ "$CONN" != "true" ]; then
  echo "[action] Opening login. If a popup shows 'Existing Session Detected', click 'Reconnect This Session'."
  open "https://localhost:${PORT}/" >/dev/null 2>&1 || true
fi

for i in {1..60}; do
  reauth
  sleep 2
  S="$(status)"; echo "[status] $S"
  AUTH="$(ibkr_is_authenticated "$S")"
  CONN="$(ibkr_is_connected "$S")"
  if [ "$AUTH" = "true" ] && [ "$CONN" = "true" ]; then break; fi
done

echo "--- accounts"
curl -sk "$BASE/iserver/accounts" | head -c 1200; echo
