import { describe, expect, it } from "vitest";
import { GAUGE_MAX, GAUGE_MIN, onRing, wpmAtPoint } from "../rsvp-dial";

// The gauge is drawn in a 220 box: centre (110, 110), ring radius 103.
describe("onRing", () => {
	it("takes a touch on the ring or a finger's width off it", () => {
		expect(onRing(110, 7)).toBe(true);
		expect(onRing(110, 22)).toBe(true);
	});

	it("ignores a tap on the centre number or in the corners", () => {
		expect(onRing(110, 104)).toBe(false);
		expect(onRing(0, 0)).toBe(false);
		expect(onRing(220, 0)).toBe(false);
	});
});

describe("wpmAtPoint", () => {
	it("maps the top of the ring to the middle of the gauge", () => {
		expect(wpmAtPoint(110, 7)).toBe((GAUGE_MIN + GAUGE_MAX) / 2);
	});
});
