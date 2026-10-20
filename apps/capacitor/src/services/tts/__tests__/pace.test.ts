import { describe, expect, it } from "vitest";
import { nextBaseline, PaceMeter, rateFor } from "../pace";

describe("rateFor", () => {
	it("turns a WPM target into the engine's multiplier, within its range", () => {
		expect(rateFor(170, 170)).toBe(1);
		expect(rateFor(255, 170)).toBe(1.5);
		expect(rateFor(2000, 170)).toBe(3);
		expect(rateFor(40, 170)).toBe(0.5);
	});
});

describe("nextBaseline", () => {
	it("learns the voice's pace at rate 1 gradually", () => {
		// Measured 300 wpm at rate 1.5 means 200 at rate 1; move 30% of the way there.
		expect(nextBaseline(170, 300, 1.5)).toBe(179);
	});
});

describe("PaceMeter", () => {
	it("measures words per minute once enough speech has been heard", () => {
		const meter = new PaceMeter();
		let t = 0;
		for (let word = 0; word <= 60; word++, t += 300) meter.record(word, t);
		expect(meter.wpm()).toBe(200);
	});

	it("ignores pauses, skips and going back", () => {
		const meter = new PaceMeter();
		let t = 0;
		for (let word = 0; word <= 60; word++, t += 300) meter.record(word, t);
		meter.record(61, t + 60_000);
		meter.record(500, t + 60_300);
		meter.record(20, t + 60_600);
		expect(meter.wpm()).toBe(200);
	});

	it("knows nothing before fifteen seconds of speech", () => {
		const meter = new PaceMeter();
		meter.record(0, 0);
		meter.record(3, 1000);
		expect(meter.wpm()).toBeNull();
	});
});
