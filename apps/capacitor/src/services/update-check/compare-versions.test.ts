import { describe, expect, it } from "vitest";
import { compareVersions, shouldPromptUpdate } from "./compare-versions";

describe("compareVersions", () => {
	it("orders by major, minor, then patch", () => {
		expect(compareVersions("1.4.6", "1.4.5")).toBe(1);
		expect(compareVersions("1.4.5", "1.4.6")).toBe(-1);
		expect(compareVersions("2.0.0", "1.9.9")).toBe(1);
		expect(compareVersions("1.10.0", "1.9.0")).toBe(1);
	});

	it("treats equal versions as equal", () => {
		expect(compareVersions("1.4.6", "1.4.6")).toBe(0);
	});

	it("pads missing segments with zero", () => {
		expect(compareVersions("1.4", "1.4.0")).toBe(0);
		expect(compareVersions("1.4.1", "1.4")).toBe(1);
	});

	it("ignores non-numeric junk by coercing to zero", () => {
		expect(compareVersions("1.4.x", "1.4.0")).toBe(0);
	});
});

describe("shouldPromptUpdate", () => {
	it("prompts when latest is newer and not muted", () => {
		expect(shouldPromptUpdate("1.4.5", "1.4.6", null)).toBe(true);
	});

	it("does not prompt when already on the latest", () => {
		expect(shouldPromptUpdate("1.4.6", "1.4.6", null)).toBe(false);
	});

	it("does not prompt when current is somehow ahead of latest", () => {
		expect(shouldPromptUpdate("1.5.0", "1.4.6", null)).toBe(false);
	});

	it("does not prompt when the newer version is muted", () => {
		expect(shouldPromptUpdate("1.4.5", "1.4.6", "1.4.6")).toBe(false);
	});

	it("prompts again once an even newer version ships past the muted one", () => {
		expect(shouldPromptUpdate("1.4.5", "1.4.7", "1.4.6")).toBe(true);
	});

	it("does not prompt when the server reports no version", () => {
		expect(shouldPromptUpdate("1.4.5", null, null)).toBe(false);
		expect(shouldPromptUpdate("1.4.5", undefined, null)).toBe(false);
	});
});
