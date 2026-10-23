# ServoPhone v0.1

Mobile-first touchscreen servo controller. Static web UI (GitHub Pages) + ESP32 firmware for hobby servo actuation.

**Live hardware control from a GitHub Pages (HTTPS) origin to a plain-HTTP ESP32 is subject to browser mixed-content and Local Network Access restrictions.** Simulation mode is fully functional without hardware. See [docs/connectivity.md](docs/connectivity.md).

## Quick start (simulation)

1. Open the deployed GitHub Pages site, or serve locally:
   ```bash
   python3 -m http.server 8080
   ```
2. Open `http://localhost:8080` in a browser (phone or desktop).
3. Use **Simulation** mode (default). Drag the dial or type an angle — no ESP32 required.

## Repository layout

```
index.html
assets/css/style.css
assets/js/
  app.js          # UI wiring, limits, status
  dial.js         # touch-friendly rotary dial
  transport.js    # SimulationTransport | HttpTransport
firmware/esp32/   # Arduino-compatible sketch
docs/
  architecture.md
  hardware-setup.md
  connectivity.md
  api.md
tests/
.github/workflows/
```

## Feature branch

All implementation lives on `feat/touchscreen-servo-controller`. Do not merge to `main` until reviewed.

## API contract (v1)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/status` | Firmware readiness, config, commanded angle |
| POST | `/api/servo` | Set target angle (JSON `{ "angle": number }`) |
| POST | `/api/servo/disable` | Disable servo output where supported |

See [docs/api.md](docs/api.md).

## Firmware

See [firmware/esp32/README.md](firmware/esp32/README.md) and [docs/hardware-setup.md](docs/hardware-setup.md).

**Power:** Do not power the servo from the ESP32 3.3 V pin. Use an external supply and common ground.

## Connectivity architecture (selected)

- **Transport abstraction** so the UI is not coupled to one mechanism.
- **SimulationTransport** (default) — never sends real actuator commands.
- **HttpTransport** — direct browser → ESP32 HTTP, with CORS, timeouts, and validation.
- **No internet-facing relay or cloud dependency.**

Direct HTTPS (GitHub Pages) → HTTP (ESP32) is **blocked as mixed content** on most mobile browsers (especially iOS Safari). Chrome’s Local Network Access permission can help on recent Chrome when the target is a private IP or `.local` host and the user grants permission. For reliable mobile control, prefer loading the UI over HTTP from the same LAN (e.g. serve static files from the ESP32 or a local HTTP server) or use simulation.

Live hardware control is **unverified on target mobile browsers** in this development environment. Treat physical actuation as a remaining validation step.

## Deployment

GitHub Pages is configured via `.github/workflows/pages.yml` from the feature branch (or document the required Pages settings if the repository uses a different source).

## License

MIT (or as otherwise stated by the repository owner).
