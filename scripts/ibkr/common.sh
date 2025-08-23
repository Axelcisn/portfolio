# Common helpers for IBKR scripts

# Detect active gateway port: prefer saved port, else 5001/5000 if listening, else 5001
ibkr_detect_port() {
  if [ -f /tmp/ibkr_gateway_port ]; then
    cat /tmp/ibkr_gateway_port
  elif lsof -nP -iTCP:5001 -sTCP:LISTEN >/dev/null 2>&1; then
    echo 5001
  elif lsof -nP -iTCP:5000 -sTCP:LISTEN >/dev/null 2>&1; then
    echo 5000
  else
    echo 5001
  fi
}

# Construct base API URL using detected port
ibkr_base_url() {
  local port
  port="$(ibkr_detect_port)"
  echo "https://localhost:${port}/v1/api"
}

# Fetch auth status JSON from gateway
ibkr_auth_status() {
  local base="${1:-$(ibkr_base_url)}"
  curl -sk -X POST --data "" "$base/iserver/auth/status" || true
}

# Internal helper to grab a field from status JSON
_ibkr_status_field() {
  local key="$1" json="$2"
  printf '%s' "$json" | tr -d '\n' | sed -n "s/.*\"${key}\":\([^,}]*\).*/\1/p"
}

ibkr_is_authenticated() {
  _ibkr_status_field authenticated "$1"
}

ibkr_is_connected() {
  _ibkr_status_field connected "$1"
}
