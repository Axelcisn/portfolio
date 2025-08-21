#!/usr/bin/env bash
set -euo pipefail

# IBKR Client Portal Gateway bootstrap (macOS)
# Downloads, configures port, starts, opens login UI, saves chosen port.
# Download source used below is the official IBKR download host.
# Docs: run via ./bin/run.sh root/conf.yaml; probe /v1/api/tickle. 

WORKDIR="vendor/ibkr-cp-gw"
ZIP_URL="https://download2.interactivebrokers.com/portal/clientportal.gw.zip"

mkdir -p "$WORKDIR"
cd "$WORKDIR"

if [ ! -f "bin/run.sh" ]; then
  echo "[download] Client Portal Gateway..."
  curl -L -o clientportal.gw.zip "$ZIP_URL"
  unzip -q clientportal.gw.zip
  rm -f clientportal.gw.zip
fi

# Choose port: 5000 if free, else 5001
TARGET_PORT=5000
if lsof -nP -iTCP:5000 -sTCP:LISTEN >/dev/null 2>&1; then
  TARGET_PORT=5001
fi
printf "%s" "$TARGET_PORT" > /tmp/ibkr_gateway_port

# Ensure conf.yaml has the chosen port
CONF="root/conf.yaml"
if [ -f "$CONF" ]; then
  cp "$CONF" "${CONF}.bak"
  if grep -qE '^\s*listenPort:' "$CONF"; then
    sed -i.bak -E "s/^(\\s*listenPort:\\s*).*/\\1${TARGET_PORT}/" "$CONF"
  else
    printf "\nlistenPort: %s\n" "${TARGET_PORT}" >> "$CONF"
  fi
fi

# Start gateway if not already serving on TARGET_PORT
UP_CHECK() { curl -sk --max-time 2 -o /dev/null -w "%{http_code}" "https://localhost:${TARGET_PORT}/v1/api/tickle" || true; }
if ! UP_CHECK | grep -qE '^(200|401)$'; then
  echo "[start] launching gateway on https://localhost:${TARGET_PORT} ..."
  nohup ./bin/run.sh root/conf.yaml >/tmp/ibkr_gateway.log 2>&1 &
  for i in {1..60}; do
    if UP_CHECK | grep -qE '^(200|401)$'; then break; fi
    sleep 1
  done
fi

# Open login UI in default browser (self-signed cert -> allow)
if command -v open >/dev/null 2>&1; then
  open "https://localhost:${TARGET_PORT}/"
fi

echo "[ready] Gateway on https://localhost:${TARGET_PORT}"
echo "[note] After browser login, you can probe with:"
echo 'PORT=$(cat /tmp/ibkr_gateway_port); curl -sk "https://localhost:${PORT}/v1/api/tickle"'
