# ServoPhone ESP32 firmware

Arduino-compatible sketch for a minimal HTTP servo controller.

## Dependencies

- **Board package:** esp32 by Espressif Systems (Arduino IDE Board Manager)
- **Library:** [ESP32Servo](https://github.com/madhephaestus/ESP32Servo) (Library Manager: search “ESP32Servo”)

## Configuration

Edit `ServoPhone.ino` **locally** (do not commit secrets):

| Symbol | Purpose |
|--------|---------|
| `WIFI_SSID` / `WIFI_PASSWORD` | Station credentials |
| `SERVO_PIN` | GPIO for servo signal (default 13) |
| `SERVO_MIN_US` / `SERVO_MAX_US` | Pulse widths for 0° / 180° |
| `ANGLE_MIN` / `ANGLE_MAX` | Software angle limits |
| `MIN_COMMAND_INTERVAL_MS` | Bound write rate |

Optional static IP: uncomment and set `local_IP`, `gateway`, `subnet`.

## Flash

1. Select board: **ESP32 Dev Module** (or your module).
2. Select port.
3. Upload `ServoPhone.ino`.
4. Open Serial Monitor at 115200 baud; note the assigned IP.

## Hardware

See [docs/hardware-setup.md](../../docs/hardware-setup.md).

- External supply for the servo motor.
- Common ground between ESP32 and supply.
- Signal wire only on `SERVO_PIN`.

## API

See [docs/api.md](../../docs/api.md).

**Commanded vs measured position:** This firmware reports the last commanded angle only. Typical hobby servos do not provide position feedback to the application.

## Host-side mock

For CI without hardware, use the Python mock in `tests/mock_esp32_server.py`.
