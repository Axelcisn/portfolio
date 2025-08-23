#!/usr/bin/env bash
set -euo pipefail

. "$(dirname "$0")/common.sh"

PORT="$(ibkr_detect_port)"
BASES=("https://127.0.0.1:${PORT}/v1/api" "$(ibkr_base_url)")

echo "=== IBKR SNAPSHOT ==="
echo "[1/5] Port $PORT listening?"
if lsof -nP -iTCP:${PORT} -sTCP:LISTEN >/dev/null 2>&1; then
  echo "OK: $PORT LISTENING"
else
  echo "NO: $PORT NOT LISTENING"
fi

echo
echo "[2/5] IBKR processes"
ps aux | egrep -i "client.*portal|ibgateway|tws" | grep -v egrep || echo "None"

for BASE in "${BASES[@]}"; do
  echo
  echo "[3/5] $BASE /sso/validate"
  curl -sk -w '\nHTTP %{http_code}\n' "$BASE/sso/validate" || true

  echo
  echo "[4/5] $BASE /tickle (keepalive)"
  curl -sk -X POST -w '\nHTTP %{http_code}\n' "$BASE/tickle" || true

  echo
  echo "[5/5] $BASE quick data probes"
  echo "- /iserver/accounts"
  curl -sk -w '\nHTTP %{http_code}\n' "$BASE/iserver/accounts" | head -c 800; echo
  echo "- /iserver/secdef/search?symbol=AAPL"
  curl -skG --data-urlencode "symbol=AAPL" -w '\nHTTP %{http_code}\n' "$BASE/iserver/secdef/search" | head -c 800; echo
done
echo "=== END ==="
