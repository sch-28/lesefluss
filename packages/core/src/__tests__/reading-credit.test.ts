import { describe, expect, it } from "vitest";
import {
	CREDIT_BURST_WORDS,
	creditCeilingWpm,
	RSVP_DIAL_HEADROOM,
	refillCredit,
	SANE_WPM_CEILING,
	spendCredit,
} from "../reading-credit";
import { MAX_PLAUSIBLE_WPM } from "../reading-rates";

describe("creditCeilingWpm", () => {
	it("gives scroll and page the global ceiling whatever the dial says", () => {
		expect(creditCeilingWpm("scroll", null)).toBe(SANE_WPM_CEILING);
		expect(creditCeilingWpm("page", 300)).toBe(SANE_WPM_CEILING);
		expect(creditCeilingWpm("scroll", 1400)).toBe(SANE_WPM_CEILING);
	});

	it("gives RSVP the dial plus headroom, which may sit above or below the global ceiling", () => {
		expect(creditCeilingWpm("rsvp", 300)).toBe(300 * RSVP_DIAL_HEADROOM);
		expect(creditCeilingWpm("rsvp", 1000)).toBe(1000 * RSVP_DIAL_HEADROOM);
	});

	it("clamps a forged RSVP dial to the plausible maximum", () => {
		expect(creditCeilingWpm("rsvp", 100_000)).toBe(MAX_PLAUSIBLE_WPM);
		expect(creditCeilingWpm("rsvp", MAX_PLAUSIBLE_WPM / RSVP_DIAL_HEADROOM)).toBe(
			MAX_PLAUSIBLE_WPM,
		);
	});

	it("falls back to the global ceiling for a missing, zero or negative dial", () => {
		expect(creditCeilingWpm("rsvp", null)).toBe(SANE_WPM_CEILING);
		expect(creditCeilingWpm("rsvp", 0)).toBe(SANE_WPM_CEILING);
		expect(creditCeilingWpm("rsvp", -500)).toBe(SANE_WPM_CEILING);
	});
});

describe("refillCredit", () => {
	it("adds the mode's ceiling pro rata for the elapsed time", () => {
		expect(refillCredit(0, "scroll", null, 15_000)).toBe(SANE_WPM_CEILING / 4);
		expect(refillCredit(10, "rsvp", 240, 30_000)).toBe(10 + (240 * RSVP_DIAL_HEADROOM) / 2);
	});

	it("never holds more than the burst, however long the reader sat still", () => {
		expect(refillCredit(0, "scroll", null, 60 * 60_000)).toBe(CREDIT_BURST_WORDS);
		expect(refillCredit(CREDIT_BURST_WORDS - 1, "page", null, 1000)).toBe(CREDIT_BURST_WORDS);
	});

	it("adds nothing for zero or negative elapsed time", () => {
		expect(refillCredit(42, "scroll", null, 0)).toBe(42);
		expect(refillCredit(42, "scroll", null, -60_000)).toBe(42);
	});
});

describe("spendCredit", () => {
	it("credits the whole move when the bucket covers it", () => {
		expect(spendCredit(300, 1000, 1200)).toEqual({ credited: 200, budget: 100 });
	});

	it("credits a burst larger than the bucket only up to what it holds", () => {
		expect(spendCredit(120, 0, 5000)).toEqual({ credited: 120, budget: 0 });
	});

	it("credits whole words and keeps the fraction for later", () => {
		expect(spendCredit(10.75, 0, 50)).toEqual({ credited: 10, budget: 0.75 });
		expect(spendCredit(300, 0, 7.9)).toEqual({ credited: 7, budget: 293 });
	});

	it("credits nothing and keeps the bucket for moving backwards or standing still", () => {
		expect(spendCredit(300, 1200, 1000)).toEqual({ credited: 0, budget: 300 });
		expect(spendCredit(300, 1000, 1000)).toEqual({ credited: 0, budget: 300 });
	});

	it("credits nothing from an empty or overdrawn bucket", () => {
		expect(spendCredit(0, 0, 100)).toEqual({ credited: 0, budget: 0 });
		expect(spendCredit(0.5, 0, 100)).toEqual({ credited: 0, budget: 0.5 });
		expect(spendCredit(-5, 0, 100)).toEqual({ credited: 0, budget: -5 });
	});
});
