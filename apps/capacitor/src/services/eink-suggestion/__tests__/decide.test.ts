import { describe, expect, it } from "vitest";
import { einkSuggestionFor } from "../decide";

const eReader = {
	isEinkDevice: true,
	isEinkMode: false,
	isOnboardingCompleted: false,
	wasAutoApplied: false,
	wasDismissed: false,
};

describe("einkSuggestionFor", () => {
	it("switches the mode on before onboarding on a fresh e-reader install", () => {
		expect(einkSuggestionFor(eReader)).toBe("auto-enable");
	});

	it("only asks on an install that is already set up", () => {
		expect(einkSuggestionFor({ ...eReader, isOnboardingCompleted: true })).toBe("prompt");
	});

	it("does nothing on other devices", () => {
		expect(einkSuggestionFor({ ...eReader, isEinkDevice: false })).toBe("none");
		expect(
			einkSuggestionFor({ ...eReader, isEinkDevice: false, isOnboardingCompleted: true }),
		).toBe("none");
	});

	it("does nothing when the mode is already on", () => {
		expect(einkSuggestionFor({ ...eReader, isEinkMode: true })).toBe("none");
	});

	it("respects a user who turned the auto-applied mode off again", () => {
		expect(einkSuggestionFor({ ...eReader, wasAutoApplied: true })).toBe("none");
		expect(
			einkSuggestionFor({ ...eReader, wasAutoApplied: true, isOnboardingCompleted: true }),
		).toBe("none");
	});

	it("never asks twice", () => {
		expect(einkSuggestionFor({ ...eReader, isOnboardingCompleted: true, wasDismissed: true })).toBe(
			"none",
		);
	});
});
