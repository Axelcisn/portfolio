#!/usr/bin/env bash
set -euo pipefail

SYMS=("$@"); [ ${#SYMS[@]} -gt 0 ] || SYMS=(MSFT AAPL)

# Detect active port
PORT="$(cat /tmp/ibkr_gateway_port 2>/dev/null || true)"
if [ -z "${PORT:-}" ]; then
  if lsof -nP -iTCP:5001 -sTCP:LISTEN >/dev/null 2>&1; then PORT=5001
  elif lsof -nP -iTCP:5000 -sTCP:LISTEN >/dev/null 2>&1; then PORT=5000
  else PORT=5001; fi
fi
BASE="https://localhost:${PORT}/v1/api"
echo "[using] $BASE"

# Helpers
is_array() { command -v jq >/dev/null 2>&1 && printf '%s' "$1" | jq -e 'type=="array"' >/dev/null 2>&1; }
has_error() { command -v jq >/dev/null 2>&1 && printf '%s' "$1" | jq -e 'has("error")' >/dev/null 2>&1 || grep -q '"error"' <<<"$1"; }

for SYM in "${SYMS[@]}"; do
  echo "== $SYM =="

  # --- search
  SEARCH="$(curl -skG --data-urlencode "symbol=${SYM}" "$BASE/iserver/secdef/search" -w $'\nHTTP %{http_code}\n')"
  HTTP="$(printf '%s\n' "$SEARCH" | tail -n1 | awk '{print $2}')"
  BODY="$(printf '%s\n' "$SEARCH" | sed '$d')"
  echo "[search.http] $HTTP  [bytes] $(printf '%s' "$BODY" | wc -c)"

  # If error or not array -> skip jq to avoid "Cannot index string..." errors
  if [ "$HTTP" != "200" ] || has_error "$BODY" || ! is_array "$BODY"; then
    echo "[search] not a data array (likely no bridge / not connected)"; continue
  fi

  # Extract STK conid (jq only runs when BODY is confirmed array)
  CONID="$(printf '%s' "$BODY" | jq -r 'map(select(.sections[]? | .secType=="STK")) | .[0].conid // .[0].conid // empty' 2>/dev/null || true)"
  if [ -z "$CONID" ]; then
    CONID="$(printf '%s' "$BODY" | tr -d '\n' | grep -Eo '"conid":"?[0-9]+"' | head -1 | grep -Eo '[0-9]+' || true)"
  fi
  echo "[conid] ${CONID:-none}"
  [ -z "${CONID:-}" ] && continue

  # --- secdef.info
  INFO="$(curl -sk "$BASE/iserver/secdef/info?conid=${CONID}" -w $'\nHTTP %{http_code}\n')"
  IHTTP="$(printf '%s\n' "$INFO" | tail -n1 | awk '{print $2}')"
  IBODY="$(printf '%s\n' "$INFO" | sed '$d')"
  CURR="$( (command -v jq >/dev/null 2>&1 && printf '%s' "$IBODY" | jq -r 'if type=="array" then (.[0].currency // empty) else (.currency // empty) end' 2>/dev/null) || true )"
  echo "[info.http] $IHTTP  [currency] ${CURR:-unknown}"

  # --- snapshot
  FIELDS="31,84,86,70,71,83"
  SNAP="$(curl -skG --data-urlencode "conids=${CONID}" --data-urlencode "fields=${FIELDS}" "$BASE/iserver/marketdata/snapshot" -w $'\nHTTP %{http_code}\n')"
  SHTTP="$(printf '%s\n' "$SNAP" | tail -n1 | awk '{print $2}')"
  SBODY="$(printf '%s\n' "$SNAP" | sed '$d')"
  LAST="$( (command -v jq >/dev/null 2>&1 && printf '%s' "$SBODY" | jq -r 'if type=="array" and length>0 then (.[0]["31"] // empty) else empty end' 2>/dev/null) || true )"
  echo "[snapshot.http] $SHTTP  [last(31)] ${LAST:-n/a}"
  echo
done
