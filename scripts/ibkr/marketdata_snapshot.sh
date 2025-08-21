#!/usr/bin/env bash
set -euo pipefail

SYMBOL="${1:-AAPL}"

# Detect active port
PORT="$(cat /tmp/ibkr_gateway_port 2>/dev/null || true)"
if [ -z "${PORT:-}" ]; then
  if lsof -nP -iTCP:5001 -sTCP:LISTEN >/dev/null 2>&1; then PORT=5001
  elif lsof -nP -iTCP:5000 -sTCP:LISTEN >/dev/null 2>&1; then PORT=5000
  else PORT=5001; fi
fi
BASE="https://localhost:${PORT}/v1/api"
echo "[using] $BASE  SYMBOL=${SYMBOL}"

# Keepalive + nudge auth
curl -sk -X POST --data "" "$BASE/tickle" >/dev/null || true
curl -sk -X POST --data "" "$BASE/iserver/reauthenticate" >/dev/null || true

# Ensure connected
for i in {1..60}; do
  S="$(curl -sk -X POST --data "" "$BASE/iserver/auth/status" || true)"
  echo "[status] $S"
  if echo "$S" | grep -q '"authenticated":true' && echo "$S" | grep -q '"connected":true'; then break; fi
  sleep 1
done

# 1) Find conid from search
SEARCH_JSON="$(curl -skG --data-urlencode "symbol=${SYMBOL}" "$BASE/iserver/secdef/search" || true)"
echo "[search.len] $(printf '%s' "$SEARCH_JSON" | wc -c) bytes"

# Prefer STK conid when jq exists; else first conid seen
CONID=""
if command -v jq >/dev/null 2>&1; then
  CONID="$(printf '%s' "$SEARCH_JSON" | jq -r 'map(select(.sections[]? | .secType=="STK")) | .[0].conid // empty')"
fi
if [ -z "$CONID" ]; then
  CONID="$(printf '%s' "$SEARCH_JSON" | tr -d '\n' | grep -Eo '"conid":"?[0-9]+"' | head -1 | grep -Eo '[0-9]+')"
fi
if [ -z "$CONID" ]; then
  echo "[error] conid not found for ${SYMBOL}"; exit 2
fi
echo "[conid] $CONID"

# 2) Snapshot
SNAP_URL="$BASE/iserver/marketdata/snapshot"
echo "[snapshot] fields=31,84,85,86,88,70"
curl -skG --data-urlencode "conids=${CONID}" --data-urlencode "fields=31,84,85,86,88,70" -w '\nHTTP %{http_code}\n' "$SNAP_URL" | head -c 2000; echo
