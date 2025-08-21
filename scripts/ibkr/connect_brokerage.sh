#!/usr/bin/env bash
set -euo pipefail

# Discover active port (prefer saved, else listening)
read_port() { [ -f /tmp/ibkr_gateway_port ] && cat /tmp/ibkr_gateway_port || echo ""; }
PORT="$(read_port)"
if [ -z "$PORT" ]; then
  if lsof -nP -iTCP:5001 -sTCP:LISTEN >/dev/null 2>&1; then PORT=5001
  elif lsof -nP -iTCP:5000 -sTCP:LISTEN >/dev/null 2>&1; then PORT=5000
  else PORT=5001; fi
fi
BASE="https://localhost:${PORT}/v1/api"
echo "[using] $BASE"

probe() {
  local name="$1" url="$2" method="${3:-POST}"
  echo "--- $name $url"
  if [ "$method" = "POST" ]; then
    curl -sk -X POST --data "" -w '\nHTTP %{http_code}\n' "$url" || true
  else
    curl -sk -w '\nHTTP %{http_code}\n' "$url" || true
  fi
}

# Keepalive + SSO check
probe "tickle"           "$BASE/tickle" POST
probe "sso/validate"     "$BASE/sso/validate" POST

# Initialize brokerage session (bridge)
probe "init ssodh"       "$BASE/iserver/auth/ssodh/init" POST || true
probe "reauthenticate"   "$BASE/iserver/reauthenticate" POST || true

# Poll until authenticated & connected
echo "[wait] brokerage auth -> connected"
ok=0
for i in {1..60}; do
  RESP="$(curl -sk -X POST --data "" "$BASE/iserver/auth/status" || true)"
  echo "$RESP"
  if echo "$RESP" | grep -q '"authenticated":true' && echo "$RESP" | grep -q '"connected":true'; then
    ok=1; echo "[ok] bridge ready"; break
  fi
  sleep 2
done
if [ "$ok" -ne 1 ]; then echo "[warn] still not connected"; fi

# Verify accounts and a simple symbol search
probe "accounts"         "$BASE/iserver/accounts" GET
probe "secdef search"    "$BASE/iserver/secdef/search?symbol=AAPL" GET
