#!/usr/bin/env bash
set -u

BASES=("https://127.0.0.1:5000/v1/api" "https://localhost:5000/v1/api")

echo "=== IBKR SNAPSHOT ==="
echo "[1/5] Port 5000 listening?"
if lsof -nP -iTCP:5000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "OK: 5000 LISTENING"
else
  echo "NO: 5000 NOT LISTENING"
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
