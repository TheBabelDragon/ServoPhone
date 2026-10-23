# Connectivity

## Problem

GitHub Pages serves the UI over **HTTPS**. The ESP32 sketch serves a plain **HTTP** API on the local network. Browsers treat `fetch()` / XHR from an HTTPS page to an HTTP URL as **active mixed content** and block it.

Additional layers:

| Platform | Behaviour |
|----------|-----------|
| **iOS Safari** | Strict mixed-content blocking; local network privacy prompts for apps; HTTPS→HTTP to LAN devices is generally **not** usable for XHR from a public HTTPS origin. |
| **Chrome (desktop/Android)** | Mixed content blocked by default. **Local Network Access (LNA)** is rolling out: with user permission and private IP / `.local` / `targetAddressSpace: "local"`, some HTTP local requests may be exempt from mixed-content checks. Not universal; not equivalent on iOS. |
| **Desktop Firefox** | Mixed content blocked; behaviour differs from Chrome LNA. |

**Conclusion:** Do **not** assume that a GitHub Pages deployment can directly control an arbitrary HTTP ESP32 endpoint from a phone browser.

## Options evaluated

### 1. Direct browser → ESP32 HTTP

- **Pros:** Simple; matches the API contract; works when the **page itself** is loaded over HTTP on the same LAN (e.g. `http://esp32-ip/` if the firmware also hosts static files, or a local `python -m http.server`).
- **Cons:** From GitHub Pages HTTPS, blocked as mixed content on most mobile browsers. Chrome LNA may help on recent Chrome only after a permission grant.
- **Status:** Implemented as `HttpTransport`. Marked **best-effort / unverified on target mobile browsers** in this environment.

### 2. Local Python bridge

- A process on a laptop accepts commands and forwards to the ESP32.
- **Pros:** Can validate angles, add auth, log.
- **Cons:** If the bridge is HTTP and the UI is still on GitHub Pages HTTPS, the **same mixed-content problem** remains between phone and bridge. An HTTPS bridge requires certificates trusted on the phone (self-signed is painful). Does not solve mobile-from-Pages without extra local HTTPS infrastructure.
- **Decision:** **Not included** in v0.1. It does not materially improve verified mobile connectivity from GitHub Pages without introducing cert/trust complexity or an internet relay (forbidden by project rules).

### 3. HTTPS on the ESP32 / public relay

- TLS on ESP32 needs a cert the phone trusts (custom CA or public name + Let’s Encrypt), which is heavy for a hobby servo.
- Public port forwarding or a cloud relay would move actuator control onto the internet — **out of scope** and explicitly disallowed for this project.

## Selected architecture

| Mode | Role |
|------|------|
| **Simulation** (default) | Full UI behaviour; never sends actuator commands. Safe for demos and CI. |
| **Live HTTP** | `HttpTransport` with CORS, timeouts, JSON validation, optional `targetAddressSpace: "local"`. |

Transport is abstracted so a future bridge or same-origin firmware-hosted UI can plug in without rewriting the dial logic.

## Practical recommendations

1. **Demo / review:** Use Simulation mode on the GitHub Pages site.
2. **Desktop same LAN:** Open the static site via `http://localhost:…` or a LAN HTTP server, then Connect to `http://<esp32-ip>`.
3. **Phone same LAN:** Prefer loading the UI over **HTTP** from a host on the LAN (or from the ESP32 if you extend firmware to serve `index.html`). Avoid relying on GitHub Pages → ESP32 for production mobile control until LNA support is verified on your target browsers.
4. **Always** validate angles on both UI and firmware.

## Verification status

| Check | Status |
|-------|--------|
| Simulation dial, limits, coalescing | Implemented; runnable without hardware |
| Firmware API contract | Implemented; mock server in `tests/` |
| Direct HTTP from this agent environment to a real ESP32 | **Not performed** (no hardware attached) |
| Live control from iOS Safari on GitHub Pages | **Unverified** — expected to fail mixed content |
| Live control from Chrome with LNA | **Unverified** in this environment |

Physical servo movement must be confirmed on real hardware by the operator. This project does not claim successful physical actuation without that test.
