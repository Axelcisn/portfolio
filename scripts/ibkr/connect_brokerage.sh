#!/usr/bin/env bash
set -euo pipefail

. "$(dirname "$0")/common.sh"

BASE="$(ibkr_base_url)"
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
  RESP="$(ibkr_auth_status "$BASE")"
  echo "$RESP"
  if [ "$(ibkr_is_authenticated "$RESP")" = "true" ] && [ "$(ibkr_is_connected "$RESP")" = "true" ]; then
    ok=1; echo "[ok] bridge ready"; break
  fi
  sleep 2
done
if [ "$ok" -ne 1 ]; then echo "[warn] still not connected"; fi

# Verify accounts and a simple symbol search
probe "accounts"         "$BASE/iserver/accounts" GET
probe "secdef search"    "$BASE/iserver/secdef/search?symbol=AAPL" GET
