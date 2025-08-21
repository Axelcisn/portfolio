#!/usr/bin/env bash
set -euo pipefail

GW_DIR="vendor/ibkr-cp-gw"
CONF="$GW_DIR/root/conf.yaml"
LOG="/tmp/ibkr_gateway.log"
PORT=5001

[ -f "$GW_DIR/bin/run.sh" ] || { echo "[error] Missing $GW_DIR/bin/run.sh"; exit 1; }

# Patch conf to port 5001
if grep -qE '^\s*listenPort:' "$CONF"; then
  perl -0777 -i.bak -pe "s/listenPort:\s*\d+/listenPort: ${PORT}/" "$CONF"
else
  printf "\nlistenPort: %s\n" "$PORT" >> "$CONF"
fi
echo "[conf] $(grep -n 'listenPort' "$CONF")"

# Ensure 5001 is free
if lsof -nP -iTCP:${PORT} -sTCP:LISTEN >/dev/null 2>&1; then
  echo "[error] port ${PORT} already in use"; exit 2
fi

# Stop any running gateway
pkill -f 'clientportal.gw.*GatewayStart' >/dev/null 2>&1 || true
sleep 1

# Launch via official runner with our conf
cd "$GW_DIR"
nohup ./bin/run.sh root/conf.yaml >"$LOG" 2>&1 &

# Wait until the API responds (200/401/403 acceptable)
for i in {1..60}; do
  code=$(curl -sk -X POST --data "" -o /dev/null -w '%{http_code}' "https://localhost:${PORT}/v1/api/tickle" || true)
  if [[ "$code" =~ ^(200|401|403)$ ]]; then echo "[ready] tickle=$code"; break; fi
  sleep 1
done

echo "${PORT}" > /tmp/ibkr_gateway_port
echo "[open] https://localhost:${PORT}/"
command -v open >/dev/null 2>&1 && open "https://localhost:${PORT}/"

printf "[probe] sso/validate: "
curl -sk -X POST --data "" -o /dev/null -w 'HTTP %{http_code}\n' "https://localhost:${PORT}/v1/api/sso/validate" || true

echo "[tail]"
tail -n 40 "$LOG" | sed 's/^/[log] /' || true
