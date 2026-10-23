/**
 * ServoPhone transport abstraction.
 * SimulationTransport never contacts hardware.
 * HttpTransport talks to the ESP32 HTTP API (or a compatible bridge).
 *
 * Live HTTPS→HTTP from GitHub Pages is restricted by mixed content / LNA.
 * See docs/connectivity.md.
 */

(function (global) {
  "use strict";

  const DEFAULT_TIMEOUT_MS = 4000;
  const API_VERSION = "1";

  class TransportError extends Error {
    constructor(message, { status = 0, code = "TRANSPORT", details = null } = {}) {
      super(message);
      this.name = "TransportError";
      this.status = status;
      this.code = code;
      this.details = details;
    }
  }

  class SimulationTransport {
    constructor() {
      this.connected = true;
      this._angle = 90;
      this._min = 0;
      this._max = 180;
      this._enabled = true;
      this._onStatus = null;
      this.mode = "simulation";
    }

    setLimits(min, max) {
      this._min = min;
      this._max = max;
    }

    async connect() {
      this.connected = true;
      this._notify();
      return this.getStatus();
    }

    async disconnect() {
      this.connected = false;
      this._notify();
    }

    async getStatus() {
      return {
        ok: true,
        mode: "simulation",
        ready: true,
        enabled: this._enabled,
        commandedAngle: this._angle,
        minAngle: this._min,
        maxAngle: this._max,
        firmware: "simulation",
        apiVersion: API_VERSION,
        note: "Simulation — no physical actuation",
      };
    }

    async setAngle(angle) {
      if (!this.connected) {
        throw new TransportError("Not connected", { code: "DISCONNECTED" });
      }
      const a = Number(angle);
      if (!Number.isFinite(a) || a < this._min || a > this._max) {
        throw new TransportError(
          `Angle ${angle} out of range [${this._min}, ${this._max}]`,
          { code: "VALIDATION", status: 400 }
        );
      }
      await delay(30 + Math.random() * 40);
      this._angle = Math.round(a);
      this._enabled = true;
      this._notify();
      return {
        ok: true,
        commandedAngle: this._angle,
        acknowledged: true,
      };
    }

    async disable() {
      if (!this.connected) {
        throw new TransportError("Not connected", { code: "DISCONNECTED" });
      }
      await delay(20);
      this._enabled = false;
      this._notify();
      return { ok: true, enabled: false };
    }

    onStatusChange(fn) {
      this._onStatus = fn;
    }

    _notify() {
      if (typeof this._onStatus === "function") {
        this.getStatus().then((s) => this._onStatus(s)).catch(() => {});
      }
    }
  }

  class HttpTransport {
    constructor(baseUrl, options = {}) {
      this.baseUrl = String(baseUrl || "").replace(/\/+$/, "");
      this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      this.connected = false;
      this._onStatus = null;
      this.mode = "http";
      this._min = 0;
      this._max = 180;
      this._lastAngle = 90;
    }

    setLimits(min, max) {
      this._min = min;
      this._max = max;
    }

    async connect() {
      if (!this.baseUrl) {
        throw new TransportError("Base URL is required", { code: "CONFIG" });
      }
      const status = await this.getStatus();
      this.connected = true;
      if (status.minAngle != null) this._min = status.minAngle;
      if (status.maxAngle != null) this._max = status.maxAngle;
      if (status.commandedAngle != null) this._lastAngle = status.commandedAngle;
      this._notify();
      return status;
    }

    async disconnect() {
      this.connected = false;
      this._notify();
    }

    async getStatus() {
      const data = await this._fetch("/api/status", { method: "GET" });
      return {
        ok: true,
        mode: "http",
        ready: Boolean(data.ready ?? data.ok ?? true),
        enabled: data.enabled !== false,
        commandedAngle: data.commandedAngle ?? data.angle ?? this._lastAngle,
        minAngle: data.minAngle ?? this._min,
        maxAngle: data.maxAngle ?? this._max,
        firmware: data.firmware ?? "esp32",
        apiVersion: data.apiVersion ?? API_VERSION,
        ...data,
      };
    }

    async setAngle(angle) {
      if (!this.connected) {
        throw new TransportError("Not connected", { code: "DISCONNECTED" });
      }
      const a = Number(angle);
      if (!Number.isFinite(a) || a < this._min || a > this._max) {
        throw new TransportError(
          `Angle ${angle} out of range [${this._min}, ${this._max}]`,
          { code: "VALIDATION", status: 400 }
        );
      }
      const data = await this._fetch("/api/servo", {
        method: "POST",
        body: JSON.stringify({ angle: Math.round(a) }),
      });
      if (!data.ok && data.acknowledged === false) {
        throw new TransportError(data.error || "Command not acknowledged", {
          code: "NACK",
          status: 502,
          details: data,
        });
      }
      this._lastAngle = Math.round(a);
      this._notify();
      return {
        ok: true,
        commandedAngle: this._lastAngle,
        acknowledged: data.acknowledged !== false,
        ...data,
      };
    }

    async disable() {
      if (!this.connected) {
        throw new TransportError("Not connected", { code: "DISCONNECTED" });
      }
      const data = await this._fetch("/api/servo/disable", {
        method: "POST",
        body: JSON.stringify({}),
      });
      this._notify();
      return { ok: true, enabled: false, ...data };
    }

    onStatusChange(fn) {
      this._onStatus = fn;
    }

    _notify() {
      if (typeof this._onStatus === "function") {
        this.getStatus().then((s) => this._onStatus(s)).catch(() => {});
      }
    }

    async _fetch(path, { method = "GET", body = null } = {}) {
      const url = this.baseUrl + path;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      const headers = {
        Accept: "application/json",
      };
      if (body != null) {
        headers["Content-Type"] = "application/json";
      }

      const fetchOpts = {
        method,
        headers,
        body,
        signal: controller.signal,
        mode: "cors",
        cache: "no-store",
      };
      try {
        if (typeof Request !== "undefined") {
          fetchOpts.targetAddressSpace = "local";
        }
      } catch (_) {}

      let res;
      try {
        res = await fetch(url, fetchOpts);
      } catch (err) {
        clearTimeout(timer);
        if (err.name === "AbortError") {
          throw new TransportError("Request timed out", {
            code: "TIMEOUT",
            status: 408,
          });
        }
        throw new TransportError(
          networkErrorMessage(err),
          { code: "NETWORK", details: String(err && err.message) }
        );
      } finally {
        clearTimeout(timer);
      }

      let data = {};
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        try {
          data = await res.json();
        } catch (_) {
          data = {};
        }
      } else {
        try {
          const text = await res.text();
          if (text) data = { message: text };
        } catch (_) {}
      }

      if (!res.ok) {
        const msg =
          data.error ||
          data.message ||
          `HTTP ${res.status} ${res.statusText || ""}`.trim();
        throw new TransportError(msg, {
          status: res.status,
          code: res.status === 400 ? "VALIDATION" : "HTTP",
          details: data,
        });
      }
      return data;
    }
  }

  function networkErrorMessage(err) {
    const m = (err && err.message) || String(err);
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) {
      return (
        "Network error — often mixed content (HTTPS page → HTTP device), " +
        "CORS, offline device, or Local Network Access denied. " +
        "Use Simulation mode, or load the UI over HTTP on the same LAN. " +
        "See docs/connectivity.md."
      );
    }
    return m || "Network request failed";
  }

  function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  global.ServoPhoneTransport = {
    SimulationTransport,
    HttpTransport,
    TransportError,
    API_VERSION,
  };
})(typeof window !== "undefined" ? window : globalThis);
