# Hardware setup

## Parts

- ESP32 development board (Wi‑Fi capable).
- Hobby servo (e.g. SG90, MG996R) — typically 4.8–6 V.
- External DC supply sized for the servo stall current (often 0.5–2+ A).
- Common ground wire between ESP32 GND and supply GND.
- Jumper wires.

## Wiring

```
External 5V+  ──────►  Servo V+ (red)
External GND  ──┬───►  Servo GND (brown/black)
                └───►  ESP32 GND

ESP32 GPIO (e.g. 13) ──►  Servo signal (orange/yellow)
```

**Do not** power the servo motor from the ESP32’s 3.3 V pin. That pin cannot supply motor current and may damage the board or cause brown-outs.

## Pulse limits

Typical hobby servo:

| Angle | Pulse width (µs) |
|-------|------------------|
| 0°    | ~500–1000        |
| 90°   | ~1500            |
| 180°  | ~2000–2500       |

Tune `SERVO_MIN_US` / `SERVO_MAX_US` in firmware for your unit. Mechanical stops may be narrower than 0–180°.

## Commanded vs measured position

A standard hobby servo does **not** expose actual shaft position to the ESP32. The API reports **commanded** angle only. Closed-loop feedback would require a different actuator or external encoder.

## Safety

- Secure the servo horn before applying large loads.
- Use the UI **Stop / Disable** control to detach the signal when idle.
- Keep fingers clear of moving linkages.
