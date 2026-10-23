/**
 * ServoPhone UI controller.
 * Coalesces dial drag updates; validates limits; never actuates in simulation.
 */

(function () {
  "use strict";

  const { SimulationTransport, HttpTransport, TransportError } =
    window.ServoPhoneTransport;

  const els = {
    modeRadios: document.querySelectorAll('input[name="mode"]'),
    baseUrl: document.getElementById("base-url"),
    baseUrlRow: document.getElementById("base-url-row"),
    btnConnect: document.getElementById("btn-connect"),
    btnDisconnect: document.getElementById("btn-disconnect"),
    statusText: document.getElementById("status-text"),
    connectionStatus: document.getElementById("connection-status"),
    angleDisplay: document.getElementById("angle-display"),
    angleInput: document.getElementById("angle-input"),
    btnInc: document.getElementById("btn-inc"),
    btnDec: document.getElementById("btn-dec"),
    btnCenter: document.getElementById("btn-center"),
    btnStop: document.getElementById("btn-stop"),
    minAngle: document.getElementById("min-angle"),
    maxAngle: document.getElementById("max-angle"),
    btnApplyLimits: document.getElementById("btn-apply-limits"),
    commandStatus: document.getElementById("command-status"),
    errorBox: document.getElementById("error-message"),
    dialEl: document.getElementById("dial"),
  };

  let transport = new SimulationTransport();
  let minA = 0;
  let maxA = 180;
  let currentAngle = 90;
  let pendingAngle = null;
  let sendInFlight = false;
  let coalesceTimer = null;
  const COALESCE_MS = 50;

  try {
    const saved = localStorage.getItem("servophone.baseUrl");
    if (saved) els.baseUrl.value = saved;
  } catch (_) {}

  const dial = new window.RotaryDial(els.dialEl, {
    min: minA,
    max: maxA,
    value: currentAngle,
    onChange: (v) => {
      currentAngle = Math.round(v);
      updateAngleUI(currentAngle, { fromDial: true });
      scheduleSend(currentAngle);
    },
    onCommit: (v) => {
      currentAngle = Math.round(v);
      updateAngleUI(currentAngle, { fromDial: true });
      flushSend(currentAngle);
    },
  });

  function updateAngleUI(angle, { fromDial = false, fromInput = false } = {}) {
    els.angleDisplay.textContent = String(Math.round(angle));
    if (!fromInput) {
      els.angleInput.value = String(Math.round(angle));
    }
    if (!fromDial) {
      dial.setValue(angle, { silent: true });
    }
  }

  function setConnectionUI(connected, modeLabel) {
    els.btnConnect.disabled = connected && transport.mode === "http";
    els.btnDisconnect.disabled = !connected;
    els.statusText.textContent = modeLabel;
    els.connectionStatus.classList.remove("ok", "warn", "err");
    if (connected) {
      els.connectionStatus.classList.add(
        transport.mode === "simulation" ? "warn" : "ok"
      );
    }
  }

  function showError(msg) {
    if (!msg) {
      els.errorBox.hidden = true;
      els.errorBox.textContent = "";
      return;
    }
    els.errorBox.hidden = false;
    els.errorBox.textContent = msg;
  }

  function setCommandStatus(text, kind = "") {
    els.commandStatus.textContent = text;
    els.commandStatus.classList.remove("ok", "warn", "err");
    if (kind) els.commandStatus.classList.add(kind);
  }

  function getSelectedMode() {
    for (const r of els.modeRadios) {
      if (r.checked) return r.value;
    }
    return "simulation";
  }

  function applyModeVisibility() {
    const mode = getSelectedMode();
    els.baseUrlRow.style.display = mode === "http" ? "block" : "none";
  }

  async function connect() {
    showError("");
    const mode = getSelectedMode();
    try {
      if (mode === "simulation") {
        transport = new SimulationTransport();
        transport.setLimits(minA, maxA);
        await transport.connect();
        setConnectionUI(true, "Simulation (no hardware)");
        setCommandStatus("Ready (simulation)", "warn");
      } else {
        const url = (els.baseUrl.value || "").trim();
        if (!url) {
          showError("Enter the ESP32 base URL (e.g. http://192.168.1.50).");
          return;
        }
        try {
          localStorage.setItem("servophone.baseUrl", url);
        } catch (_) {}
        transport = new HttpTransport(url);
        transport.setLimits(minA, maxA);
        setCommandStatus("Connecting…");
        const status = await transport.connect();
        if (status.minAngle != null) minA = status.minAngle;
        if (status.maxAngle != null) maxA = status.maxAngle;
        els.minAngle.value = minA;
        els.maxAngle.value = maxA;
        dial.setRange(minA, maxA);
        if (status.commandedAngle != null) {
          currentAngle = Math.round(status.commandedAngle);
          updateAngleUI(currentAngle);
        }
        setConnectionUI(true, `Connected · ${status.firmware || "HTTP"}`);
        setCommandStatus("Ready", "ok");
      }
    } catch (err) {
      setConnectionUI(false, "Disconnected");
      setCommandStatus("Connection failed", "err");
      showError(err.message || String(err));
      transport = new SimulationTransport();
      transport.setLimits(minA, maxA);
      await transport.connect();
      setConnectionUI(true, "Simulation (fallback after error)");
    }
  }

  async function disconnect() {
    try {
      await transport.disconnect();
    } catch (_) {}
    transport = new SimulationTransport();
    transport.setLimits(minA, maxA);
    await transport.connect();
    setConnectionUI(true, "Simulation (offline)");
    setCommandStatus("Disconnected — simulation active", "warn");
    showError("");
    for (const r of els.modeRadios) {
      r.checked = r.value === "simulation";
    }
    applyModeVisibility();
  }

  function scheduleSend(angle) {
    pendingAngle = angle;
    if (coalesceTimer != null) return;
    coalesceTimer = setTimeout(() => {
      coalesceTimer = null;
      if (pendingAngle != null) {
        const a = pendingAngle;
        pendingAngle = null;
        sendAngle(a);
      }
    }, COALESCE_MS);
  }

  function flushSend(angle) {
    if (coalesceTimer != null) {
      clearTimeout(coalesceTimer);
      coalesceTimer = null;
    }
    pendingAngle = null;
    sendAngle(angle);
  }

  async function sendAngle(angle) {
    if (sendInFlight) {
      pendingAngle = angle;
      return;
    }
    sendInFlight = true;
    setCommandStatus(`Sending ${Math.round(angle)}°…`);
    showError("");
    try {
      const result = await transport.setAngle(angle);
      if (result.acknowledged !== false) {
        setCommandStatus(
          transport.mode === "simulation"
            ? `Simulated ${result.commandedAngle}°`
            : `Acknowledged ${result.commandedAngle}°`,
          transport.mode === "simulation" ? "warn" : "ok"
        );
      } else {
        setCommandStatus("Not acknowledged", "err");
        showError("Controller did not acknowledge the command.");
      }
    } catch (err) {
      setCommandStatus("Command failed", "err");
      showError(err.message || String(err));
    } finally {
      sendInFlight = false;
      if (pendingAngle != null) {
        const a = pendingAngle;
        pendingAngle = null;
        sendAngle(a);
      }
    }
  }

  async function disableServo() {
    setCommandStatus("Disabling…");
    showError("");
    try {
      await transport.disable();
      setCommandStatus(
        transport.mode === "simulation" ? "Disabled (sim)" : "Servo disabled",
        "warn"
      );
    } catch (err) {
      setCommandStatus("Disable failed", "err");
      showError(err.message || String(err));
    }
  }

  function applyLimits() {
    let lo = Number(els.minAngle.value);
    let hi = Number(els.maxAngle.value);
    if (!Number.isFinite(lo)) lo = 0;
    if (!Number.isFinite(hi)) hi = 180;
    lo = Math.max(0, Math.min(180, Math.round(lo)));
    hi = Math.max(0, Math.min(180, Math.round(hi)));
    if (lo > hi) {
      const t = lo;
      lo = hi;
      hi = t;
    }
    minA = lo;
    maxA = hi;
    els.minAngle.value = minA;
    els.maxAngle.value = maxA;
    els.angleInput.min = minA;
    els.angleInput.max = maxA;
    dial.setRange(minA, maxA);
    transport.setLimits(minA, maxA);
    currentAngle = Math.min(maxA, Math.max(minA, currentAngle));
    updateAngleUI(currentAngle);
    setCommandStatus(`Limits ${minA}°–${maxA}°`, "ok");
  }

  els.modeRadios.forEach((r) =>
    r.addEventListener("change", () => {
      applyModeVisibility();
    })
  );
  els.btnConnect.addEventListener("click", () => connect());
  els.btnDisconnect.addEventListener("click", () => disconnect());
  els.btnInc.addEventListener("click", () => {
    currentAngle = Math.min(maxA, currentAngle + 1);
    updateAngleUI(currentAngle);
    flushSend(currentAngle);
  });
  els.btnDec.addEventListener("click", () => {
    currentAngle = Math.max(minA, currentAngle - 1);
    updateAngleUI(currentAngle);
    flushSend(currentAngle);
  });
  els.btnCenter.addEventListener("click", () => {
    currentAngle = Math.round((minA + maxA) / 2);
    updateAngleUI(currentAngle);
    flushSend(currentAngle);
  });
  els.btnStop.addEventListener("click", () => disableServo());
  els.btnApplyLimits.addEventListener("click", () => applyLimits());

  els.angleInput.addEventListener("change", () => {
    let v = Number(els.angleInput.value);
    if (!Number.isFinite(v)) v = currentAngle;
    v = Math.min(maxA, Math.max(minA, Math.round(v)));
    currentAngle = v;
    updateAngleUI(currentAngle, { fromInput: true });
    flushSend(currentAngle);
  });
  els.angleInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      els.angleInput.blur();
    }
  });

  applyModeVisibility();
  applyLimits();
  connect();
})();
