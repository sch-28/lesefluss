"""Interrupt-based rotary encoder handler (EC11).

Pin wiring:
  CLK (A) → PIN_ENCODER_CLK   (internal pull-up)
  DT  (B) → PIN_ENCODER_DT    (internal pull-up)
  SW  (E) → PIN_ENCODER_SW    (internal pull-up)
  GND     → pins C and D

Rotation: full 4-state quadrature decoder + time debounce in the ISR.
Button: delegates to a ButtonHandler instance (polled, same logic as BOOT button).
"""

from machine import Pin
import time
import config
from hw.button import ButtonHandler


# Full quadrature transition table.
# Index = (prev_ab << 2) | cur_ab, value = +1 (CW), -1 (CCW), 0 (invalid/bounce).
_QUAD_TABLE = bytearray([
#  cur: 00  01  10  11
    0,  -1,  1,  0,   # prev 00
    1,   0,  0, -1,   # prev 01
   -1,   0,  0,  1,   # prev 10
    0,   1, -1,  0,   # prev 11
])

# Minimum ms between counted transitions - rejects bounce pulses.
# Set high (80ms) since one detent = one word and no one spins fast.
_DEBOUNCE_MS = 80


class RotaryEncoderHandler:

    def __init__(self):
        self._clk = Pin(config.PIN_ENCODER_CLK, Pin.IN, Pin.PULL_UP)
        self._dt  = Pin(config.PIN_ENCODER_DT,  Pin.IN, Pin.PULL_UP)

        # ISR-safe rotation state: [0]=CW pending, [1]=CCW pending, [2]=prev AB state
        self._state = bytearray(3)
        # Initialise prev AB from current pin state
        self._state[2] = (self._clk.value() << 1) | self._dt.value()

        # Last time a valid transition was counted (ms) - for debounce
        self._last_ms = time.ticks_ms()

        # Button - reuse the exact same ButtonHandler logic as BOOT button
        self._button = ButtonHandler(pin=config.PIN_ENCODER_SW)

        self._clk.irq(trigger=Pin.IRQ_FALLING | Pin.IRQ_RISING, handler=self._on_edge)
        self._dt.irq( trigger=Pin.IRQ_FALLING | Pin.IRQ_RISING, handler=self._on_edge)

    # ------------------------------------------------------------------
    # ISR handler - full quadrature decode on both pins, both edges
    # ------------------------------------------------------------------

    def _on_edge(self, pin):
        cur = (self._clk.value() << 1) | self._dt.value()
        prev = self._state[2]
        if cur == prev:
            return  # no state change - spurious IRQ, ignore
        self._state[2] = cur
        now = time.ticks_ms()
        if time.ticks_diff(now, self._last_ms) < _DEBOUNCE_MS:
            return  # too fast - bounce, ignore
        delta = _QUAD_TABLE[(prev << 2) | cur]
        if delta == 1:
            self._state[0] += 1   # CW
            self._last_ms = now
        elif delta == 255:        # -1 stored as 255 in bytearray
            self._state[1] += 1   # CCW
            self._last_ms = now

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def get_steps(self):
        """Return net steps since last call (positive=CW, negative=CCW) and reset."""
        cw  = self._state[0]
        ccw = self._state[1]
        self._state[0] = 0
        self._state[1] = 0
        return cw - ccw

    def check_press_state(self, long_press_ms=5000):
        """Non-blocking.  Returns 'short', 'long', or None."""
        return self._button.check_press_state(long_press_ms)

    def is_pressed(self):
        return self._button.is_pressed()
