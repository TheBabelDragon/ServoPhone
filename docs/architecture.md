# Architecture

## Overview

```
┌─────────────────────┐         ┌──────────────────────┐
│  Static frontend    │  HTTP   │  ESP32 firmware      │
│  (GitHub Pages or   │◄───────►│  WebServer + ESP32Servo│
│   local HTTP)       │  JSON   │  GPIO → servo signal │
└─────────────────────┘         └──────────────────────┘
         │
         │  SimulationTransport (no network)
         ▼
   In-browser sim
```

## Frontend

- Plain HTML / CSS / vanilla JS — no framework, no CDN runtime deps.
- **Rotary dial** + numeric input + increment/decrement + center + stop.
- Configurable angle limits (UI + firmware validation).
- **Transport abstraction** (`SimulationTransport` | `HttpTransport`).
- Request coalescing while the dial is dragged (~50 ms).
- Connection status, command status, timeouts, visible errors.
- Keyboard accessible; `prefers-reduced-motion` respected; mobile layouts.

## API contract (v1)

Documented in [api.md](api.md).

- Success is only reported after the controller acknowledges the command.
- Invalid angles return HTTP 400 with a JSON error body.

## Connectivity

Documented in [connectivity.md](connectivity.md).

Selected approach:

1. Simulation always available and default.
2. Direct browser HTTP to ESP32 where the browser environment allows it.
3. No public relay or cloud dependency.

## Firmware

- Non-blocking `loop()` (no control-path `delay`).
- Bounded command frequency.
- CORS headers for cross-origin development.
- Safe init to default angle; detach on disable.

## Isolation

This repository is standalone. It does not modify other ecosystem projects.
