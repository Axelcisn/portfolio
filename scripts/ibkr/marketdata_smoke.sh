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
for i in {1..30}; do
  S="$(curl -sk -X POST --data "" "$BASE/iserver/auth/status" || true)"
  echo "[status] $S"
  if echo "$S" | grep -q '"authenticated":true' && echo "$S" | grep -q '"connected":true'; then break; fi
  sleep 1
done

# 1) Find conid from search
SEARCH_JSON="$(curl -skG --data-urlencode "symbol=${SYMBOL}" "$BASE/iserver/secdef/search" || true)"
echo "[search] HTTP $?"; echo "$SEARCH_JSON" | head -c 1200; echo

# Prefer STK conid; fallback to first conid
CONID="$(printf '%s' "$SEARCH_JSON" | tr -d '\n' | sed -n 's/.*secType":"STK"[^}]*"conid":"\([0-9]\+\)".*/\1/p')"
if [ -z "$CONID" ]; then
  CONID="$(printf '%s' "$SEARCH_JSON" | tr -d '\n' | sed -n 's/.*"conid":"\([0-9]\+\)".*/\1/p')"
fi
if [ -z "$CONID" ]; then
  echo "[error] Could not extract conid for ${SYMBOL}"
  exit 2
fi
echo "[conid] ${CONID}"

# 2) Snapshot (try with common fields; also show without fields if needed)
SNAP_URL="$BASE/iserver/marketdata/snapshot"
echo "[snapshot] fields(31,84,85,86,88,70)"
curl -skG --data-urlencode "conids=${CONID}" --data-urlencode "fields=31,84,85,86,88,70" -w '\nHTTP %{http_code}\n' "$SNAP_URL" | head -c 2000; echo

echo "[snapshot] default (no fields)"
curl -skG --data-urlencode "conids=${CONID}" -w '\nHTTP %{http_code}\n' "$SNAP_URL" | head -c 2000; echo
