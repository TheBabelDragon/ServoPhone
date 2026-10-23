# API contract v1

Base URL: `http://<device-ip>` (no trailing slash).

All responses are JSON. CORS: `Access-Control-Allow-Origin: *` (development-friendly; tighten for production if needed).

## GET /api/status

Reports firmware readiness and commanded state.

**Response 200**

```json
{
  "ok": true,
  "ready": true,
  "enabled": true,
  "commandedAngle": 90,
  "minAngle": 0,
  "maxAngle": 180,
  "firmware": "ServoPhone-esp32-0.1",
  "apiVersion": "1",
  "note": "commanded position only; hobby servos typically have no position feedback"
}
```

## POST /api/servo

Set target angle.

**Request**

```json
{ "angle": 120 }
```

**Response 200**

```json
{
  "ok": true,
  "commandedAngle": 120,
  "acknowledged": true,
  "enabled": true
}
```

**Response 400** (validation)

```json
{
  "ok": false,
  "error": "angle out of range [0, 180]"
}
```

The frontend must not treat the command as successful unless `acknowledged` is true (or equivalent success body).

## POST /api/servo/disable

Disable servo output (detach signal where supported).

**Request:** empty JSON object `{}` or empty body.

**Response 200**

```json
{
  "ok": true,
  "enabled": false,
  "acknowledged": true
}
```

## Errors

| HTTP | Meaning |
|------|---------|
| 400 | Invalid payload / out-of-range angle |
| 404 | Unknown path |
| 408 | Client-side timeout (frontend) |
| 5xx | Server / firmware failure |

## Timeouts

Frontend default: **4000 ms**. Failed requests surface a visible error and do not update “success” status.
