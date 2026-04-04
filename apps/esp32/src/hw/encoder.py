"""Interrupt-based rotary encoder handler (EC11).

Pin wiring:
  CLK (A) → PIN_ENCODER_CLK   (internal pull-up)
  DT  (B) → PIN_ENCODER_DT    (internal pull-up)
  SW  (E) → PIN_ENCODER_SW    (internal pull-up)
  GND     → pins C and D

Rotation: ISRs write to bytearray (ISR-safe in MicroPython).
Button: delegates to a ButtonHandler instance (polled, same logic as BOOT button).
"""

from machine import Pin
import config
from hw.button import ButtonHandler


class RotaryEncoderHandler:

    def __init__(self):
        self._clk = Pin(config.PIN_ENCODER_CLK, Pin.IN, Pin.PULL_UP)
        self._dt  = Pin(config.PIN_ENCODER_DT,  Pin.IN, Pin.PULL_UP)

        # ISR-safe rotation state: [0]=CW pending, [1]=CCW pending
        self._state = bytearray(2)

        # Button — reuse the exact same ButtonHandler logic as BOOT button
        self._button = ButtonHandler(pin=config.PIN_ENCODER_SW)

        self._clk.irq(trigger=Pin.IRQ_FALLING | Pin.IRQ_RISING, handler=self._on_clk)

    # ------------------------------------------------------------------
    # ISR handler — rotation only
    # ------------------------------------------------------------------

    def _on_clk(self, pin):
        if self._clk.value() == 0:          # falling edge
            if self._dt.value() == 1:
                self._state[1] += 1         # CCW
            else:
                self._state[0] += 1         # CW

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
