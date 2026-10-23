/**
 * ServoPhone ESP32 firmware (Arduino-compatible)
 *
 * API v1:
 *   GET  /api/status
 *   POST /api/servo          body: {"angle": <number>}
 *   POST /api/servo/disable
 *
 * Library: ESP32Servo (install via Library Manager)
 * Board: ESP32 Dev Module (or compatible)
 *
 * IMPORTANT:
 * - Do NOT power the servo from the ESP32 3.3V pin.
 * - Use an external 5V (or servo-rated) supply and common ground.
 * - Configure SERVO_PIN, pulse limits, and WiFi credentials below
 *   (credentials must not be committed; use secrets or edit locally).
 */

#include <WiFi.h>
#include <WebServer.h>
#include <ESP32Servo.h>

// ============ USER CONFIGURATION (edit locally; do not commit secrets) ============
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

const int   SERVO_PIN     = 13;          // GPIO for servo signal
const int   SERVO_MIN_US  = 500;         // pulse width at 0° (tune per servo)
const int   SERVO_MAX_US  = 2500;        // pulse width at 180°
const int   ANGLE_MIN     = 0;
const int   ANGLE_MAX     = 180;
const int   DEFAULT_ANGLE = 90;

// Minimum interval between physical writes (ms) — bounds command frequency
const unsigned long MIN_COMMAND_INTERVAL_MS = 20;

// Optional: static IP (leave commented to use DHCP)
// IPAddress local_IP(192, 168, 1, 50);
// IPAddress gateway(192, 168, 1, 1);
// IPAddress subnet(255, 255, 255, 0);
// =============================================================================

WebServer server(80);
Servo servo;

int commandedAngle = DEFAULT_ANGLE;
bool servoEnabled  = true;
unsigned long lastCommandMs = 0;
bool wifiReady = false;

void sendCorsHeaders() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
  server.sendHeader("Access-Control-Max-Age", "86400");
}

void handleOptions() {
  sendCorsHeaders();
  server.send(204);
}

String jsonEscape(const String& s) {
  String out;
  out.reserve(s.length() + 8);
  for (size_t i = 0; i < s.length(); i++) {
    char c = s[i];
    if (c == '"' || c == '\\') {
      out += '\\';
      out += c;
    } else if (c == '\n') {
      out += "\\n";
    } else {
      out += c;
    }
  }
  return out;
}

void handleStatus() {
  sendCorsHeaders();
  String body = "{";
  body += "\"ok\":true,";
  body += "\"ready\":";
  body += wifiReady ? "true" : "false";
  body += ",";
  body += "\"enabled\":";
  body += servoEnabled ? "true" : "false";
  body += ",";
  body += "\"commandedAngle\":";
  body += String(commandedAngle);
  body += ",";
  body += "\"minAngle\":";
  body += String(ANGLE_MIN);
  body += ",";
  body += "\"maxAngle\":";
  body += String(ANGLE_MAX);
  body += ",";
  body += "\"firmware\":\"ServoPhone-esp32-0.1\",";
  body += "\"apiVersion\":\"1\",";
  body += "\"note\":\"commanded position only; hobby servos typically have no position feedback\"";
  body += "}";
  server.send(200, "application/json", body);
}

bool parseAngleFromBody(int& outAngle, String& err) {
  if (!server.hasArg("plain")) {
    err = "Missing JSON body";
    return false;
  }
  String body = server.arg("plain");
  int key = body.indexOf("\"angle\"");
  if (key < 0) {
    err = "Missing \"angle\" field";
    return false;
  }
  int colon = body.indexOf(':', key);
  if (colon < 0) {
    err = "Invalid JSON";
    return false;
  }
  int i = colon + 1;
  while (i < (int)body.length() && (body[i] == ' ' || body[i] == '\t')) i++;
  int start = i;
  if (i < (int)body.length() && body[i] == '-') i++;
  while (i < (int)body.length() && isDigit(body[i])) i++;
  if (i == start || (body[start] == '-' && i == start + 1)) {
    err = "angle is not a number";
    return false;
  }
  int val = body.substring(start, i).toInt();
  if (val < ANGLE_MIN || val > ANGLE_MAX) {
    err = "angle out of range [" + String(ANGLE_MIN) + ", " + String(ANGLE_MAX) + "]";
    return false;
  }
  outAngle = val;
  return true;
}

void applyAngle(int angle) {
  unsigned long now = millis();
  if (now - lastCommandMs < MIN_COMMAND_INTERVAL_MS) {
    // Still accept the target; skip redundant write if too soon
  }
  commandedAngle = angle;
  if (servoEnabled) {
    servo.write(angle);
    lastCommandMs = now;
  }
}

void handleServo() {
  sendCorsHeaders();
  String err;
  int angle = 0;
  if (!parseAngleFromBody(angle, err)) {
    String body = "{\"ok\":false,\"error\":\"" + jsonEscape(err) + "\"}";
    server.send(400, "application/json", body);
    return;
  }
  applyAngle(angle);
  String body = "{";
  body += "\"ok\":true,";
  body += "\"commandedAngle\":";
  body += String(commandedAngle);
  body += ",";
  body += "\"acknowledged\":true,";
  body += "\"enabled\":";
  body += servoEnabled ? "true" : "false";
  body += "}";
  server.send(200, "application/json", body);
}

void handleDisable() {
  sendCorsHeaders();
  servoEnabled = false;
  servo.detach();
  String body = "{\"ok\":true,\"enabled\":false,\"acknowledged\":true}";
  server.send(200, "application/json", body);
}

void handleNotFound() {
  sendCorsHeaders();
  server.send(404, "application/json", "{\"ok\":false,\"error\":\"not found\"}");
}

void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.println("ServoPhone ESP32 starting…");

  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  ESP32PWM::allocateTimer(2);
  ESP32PWM::allocateTimer(3);

  servo.setPeriodHertz(50);
  servo.attach(SERVO_PIN, SERVO_MIN_US, SERVO_MAX_US);
  servo.write(DEFAULT_ANGLE);
  commandedAngle = DEFAULT_ANGLE;
  servoEnabled = true;

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to WiFi");
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
    delay(250);
    Serial.print(".");
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    wifiReady = true;
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
  } else {
    wifiReady = false;
    Serial.println("WiFi failed — API will report ready:false");
  }

  server.on("/api/status", HTTP_GET, handleStatus);
  server.on("/api/status", HTTP_OPTIONS, handleOptions);
  server.on("/api/servo", HTTP_POST, handleServo);
  server.on("/api/servo", HTTP_OPTIONS, handleOptions);
  server.on("/api/servo/disable", HTTP_POST, handleDisable);
  server.on("/api/servo/disable", HTTP_OPTIONS, handleOptions);
  server.onNotFound(handleNotFound);
  server.begin();
  Serial.println("HTTP server on port 80");
}

void loop() {
  server.handleClient();
}
