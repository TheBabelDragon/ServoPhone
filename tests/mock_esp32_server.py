#!/usr/bin/env python3
"""
Minimal mock ESP32 HTTP API for host-side tests (no hardware).
Run: python3 tests/mock_esp32_server.py
Listens on http://127.0.0.1:8765
"""

from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import re

STATE = {
    "commandedAngle": 90,
    "enabled": True,
    "minAngle": 0,
    "maxAngle": 180,
}


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Accept")

    def _json(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path == "/api/status":
            self._json(
                200,
                {
                    "ok": True,
                    "ready": True,
                    "enabled": STATE["enabled"],
                    "commandedAngle": STATE["commandedAngle"],
                    "minAngle": STATE["minAngle"],
                    "maxAngle": STATE["maxAngle"],
                    "firmware": "mock-esp32",
                    "apiVersion": "1",
                    "note": "mock — no physical servo",
                },
            )
        else:
            self._json(404, {"ok": False, "error": "not found"})

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length).decode("utf-8") if length else ""
        try:
            data = json.loads(raw) if raw.strip() else {}
        except json.JSONDecodeError:
            self._json(400, {"ok": False, "error": "invalid JSON"})
            return

        if self.path == "/api/servo":
            if "angle" not in data:
                self._json(400, {"ok": False, "error": 'Missing "angle" field'})
                return
            try:
                angle = int(data["angle"])
            except (TypeError, ValueError):
                self._json(400, {"ok": False, "error": "angle is not a number"})
                return
            lo, hi = STATE["minAngle"], STATE["maxAngle"]
            if angle < lo or angle > hi:
                self._json(
                    400,
                    {"ok": False, "error": f"angle out of range [{lo}, {hi}]"},
                )
                return
            STATE["commandedAngle"] = angle
            STATE["enabled"] = True
            self._json(
                200,
                {
                    "ok": True,
                    "commandedAngle": angle,
                    "acknowledged": True,
                    "enabled": True,
                },
            )
        elif self.path == "/api/servo/disable":
            STATE["enabled"] = False
            self._json(200, {"ok": True, "enabled": False, "acknowledged": True})
        else:
            self._json(404, {"ok": False, "error": "not found"})

    def log_message(self, fmt, *args):
        print("[mock]", fmt % args)


def main():
    host, port = "127.0.0.1", 8765
    httpd = HTTPServer((host, port), Handler)
    print(f"Mock ESP32 API at http://{host}:{port}")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
