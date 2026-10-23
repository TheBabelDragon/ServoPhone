#!/usr/bin/env python3
"""
Automated tests against mock_esp32_server.py (or a real device).
Usage:
  python3 tests/mock_esp32_server.py &
  python3 tests/test_api_contract.py
  # or: BASE_URL=http://192.168.x.x python3 tests/test_api_contract.py
"""

import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("BASE_URL", "http://127.0.0.1:8765").rstrip("/")


def request(method, path, body=None, timeout=5):
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(
        BASE + path, data=data, headers=headers, method=method
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return res.status, json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8")
        try:
            payload = json.loads(raw)
        except Exception:
            payload = {"raw": raw}
        return e.code, payload


def main():
    failed = 0

    def check(name, cond, detail=""):
        nonlocal failed
        if cond:
            print(f"  PASS  {name}")
        else:
            print(f"  FAIL  {name}  {detail}")
            failed += 1

    print(f"Testing API at {BASE}")

    code, data = request("GET", "/api/status")
    check("status 200", code == 200, f"got {code}")
    check("status ok", data.get("ok") is True)
    check("status has commandedAngle", "commandedAngle" in data)
    check("status has min/max", "minAngle" in data and "maxAngle" in data)

    code, data = request("POST", "/api/servo", {"angle": 45})
    check("servo 200", code == 200, f"got {code}")
    check("servo acknowledged", data.get("acknowledged") is True)
    check("servo angle", data.get("commandedAngle") == 45)

    code, data = request("POST", "/api/servo", {"angle": 999})
    check("out-of-range 400", code == 400, f"got {code}")
    check("out-of-range error", data.get("ok") is False)

    code, data = request("POST", "/api/servo", {})
    check("missing angle 400", code == 400, f"got {code}")

    code, data = request("POST", "/api/servo/disable", {})
    check("disable 200", code == 200, f"got {code}")
    check("disable enabled false", data.get("enabled") is False)

    code, data = request("GET", "/api/status")
    check("status after disable", data.get("enabled") is False)

    code, data = request("POST", "/api/servo", {"angle": 90})
    check("re-enable via angle", data.get("enabled") is True)

    print()
    if failed:
        print(f"{failed} test(s) failed")
        sys.exit(1)
    print("All tests passed")
    sys.exit(0)


if __name__ == "__main__":
    main()
