#!/usr/bin/env bash
# Static checks: required files present, no accidental secrets in tracked paths.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

fail=0
need() {
  if [[ ! -e "$1" ]]; then
    echo "MISSING: $1"
    fail=1
  else
    echo "OK: $1"
  fi
}

need index.html
need assets/css/style.css
need assets/js/app.js
need assets/js/dial.js
need assets/js/transport.js
need firmware/esp32/ServoPhone.ino
need docs/architecture.md
need docs/hardware-setup.md
need docs/connectivity.md
need docs/api.md
need README.md

# Ensure default WiFi placeholders are not real-looking secrets in firmware
if grep -qE 'WIFI_PASSWORD\s*=\s*"[^Y][^"]{8,}"' firmware/esp32/ServoPhone.ino 2>/dev/null; then
  echo "WARN: firmware may contain a non-placeholder password — review before commit"
fi

# Simulation transport must exist and mention never hardware
if ! grep -q 'SimulationTransport' assets/js/transport.js; then
  echo "MISSING SimulationTransport"
  fail=1
fi

if [[ $fail -ne 0 ]]; then
  echo "Static checks failed"
  exit 1
fi
echo "Static checks passed"
