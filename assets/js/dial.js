/**
 * Touch-friendly rotary dial for angle selection.
 * Maps pointer angle to [min, max] degrees.
 * Emits 'change' (continuous) and 'commit' (pointer up / keyboard).
 */

(function (global) {
  "use strict";

  class RotaryDial {
    /**
     * @param {HTMLElement} el
     * @param {{ min?: number, max?: number, value?: number, onChange?: Function, onCommit?: Function }} opts
     */
    constructor(el, opts = {}) {
      this.el = el;
      this.needle = el.querySelector(".dial-needle") || el;
      this.min = opts.min ?? 0;
      this.max = opts.max ?? 180;
      this.value = clamp(opts.value ?? 90, this.min, this.max);
      this.onChange = opts.onChange || null;
      this.onCommit = opts.onCommit || null;
      this._dragging = false;
      this._pointerId = null;

      this._onPointerDown = this._onPointerDown.bind(this);
      this._onPointerMove = this._onPointerMove.bind(this);
      this._onPointerUp = this._onPointerUp.bind(this);
      this._onKeyDown = this._onKeyDown.bind(this);

      this.el.addEventListener("pointerdown", this._onPointerDown);
      this.el.addEventListener("keydown", this._onKeyDown);
      this._render();
    }

    setRange(min, max) {
      this.min = min;
      this.max = max;
      this.value = clamp(this.value, min, max);
      this._syncAria();
      this._render();
    }

    setValue(v, { silent = false } = {}) {
      const next = clamp(Number(v), this.min, this.max);
      if (next === this.value) return;
      this.value = next;
      this._syncAria();
      this._render();
      if (!silent && this.onChange) this.onChange(this.value);
    }

    destroy() {
      this.el.removeEventListener("pointerdown", this._onPointerDown);
      this.el.removeEventListener("keydown", this._onKeyDown);
      this._releasePointer();
    }

    _syncAria() {
      this.el.setAttribute("aria-valuemin", String(this.min));
      this.el.setAttribute("aria-valuemax", String(this.max));
      this.el.setAttribute("aria-valuenow", String(Math.round(this.value)));
      this.el.setAttribute(
        "aria-valuetext",
        `${Math.round(this.value)} degrees`
      );
    }

    _render() {
      const span = this.max - this.min || 1;
      const t = (this.value - this.min) / span;
      const rot = -90 + t * 180;
      this.needle.style.transform = `rotate(${rot}deg)`;
    }

    _clientToAngle(clientX, clientY) {
      const rect = this.el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = clientX - cx;
      const dy = clientY - cy;
      let rad = Math.atan2(dy, dx);
      let deg = (rad * 180) / Math.PI;
      let servo;
      if (deg >= -180 && deg <= 0) {
        servo = this.min + ((deg + 180) / 180) * (this.max - this.min);
      } else if (deg > 0 && deg <= 90) {
        servo = this.max;
      } else {
        servo = this.min;
      }
      return clamp(servo, this.min, this.max);
    }

    _onPointerDown(e) {
      if (e.button != null && e.button !== 0) return;
      e.preventDefault();
      this._dragging = true;
      this._pointerId = e.pointerId;
      this.el.classList.add("dragging");
      this.el.setPointerCapture(e.pointerId);
      this.el.addEventListener("pointermove", this._onPointerMove);
      this.el.addEventListener("pointerup", this._onPointerUp);
      this.el.addEventListener("pointercancel", this._onPointerUp);
      const v = this._clientToAngle(e.clientX, e.clientY);
      this.setValue(v);
    }

    _onPointerMove(e) {
      if (!this._dragging || e.pointerId !== this._pointerId) return;
      e.preventDefault();
      const v = this._clientToAngle(e.clientX, e.clientY);
      this.setValue(v);
    }

    _onPointerUp(e) {
      if (e.pointerId !== this._pointerId) return;
      e.preventDefault();
      this._releasePointer();
      if (this.onCommit) this.onCommit(this.value);
    }

    _releasePointer() {
      this._dragging = false;
      this.el.classList.remove("dragging");
      this.el.removeEventListener("pointermove", this._onPointerMove);
      this.el.removeEventListener("pointerup", this._onPointerUp);
      this.el.removeEventListener("pointercancel", this._onPointerUp);
      this._pointerId = null;
    }

    _onKeyDown(e) {
      const step = e.shiftKey ? 10 : 1;
      let next = this.value;
      switch (e.key) {
        case "ArrowRight":
        case "ArrowUp":
          next = this.value + step;
          break;
        case "ArrowLeft":
        case "ArrowDown":
          next = this.value - step;
          break;
        case "Home":
          next = this.min;
          break;
        case "End":
          next = this.max;
          break;
        case "PageUp":
          next = this.value + 10;
          break;
        case "PageDown":
          next = this.value - 10;
          break;
        default:
          return;
      }
      e.preventDefault();
      this.setValue(next);
      if (this.onCommit) this.onCommit(this.value);
    }
  }

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  global.RotaryDial = RotaryDial;
})(typeof window !== "undefined" ? window : globalThis);
