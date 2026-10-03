import { describe, expect, it } from "vitest";
import { shouldAdoptServerSettings } from "../index";

describe("shouldAdoptServerSettings", () => {
	it("adopts the server row on the first pull even when local is newer", () => {
		expect(shouldAdoptServerSettings({ updatedAt: 100 }, { updatedAt: 999 }, true)).toBe(true);
	});

	it("uses last-write-wins after the first pull", () => {
		expect(shouldAdoptServerSettings({ updatedAt: 100 }, { updatedAt: 999 }, false)).toBe(false);
		expect(shouldAdoptServerSettings({ updatedAt: 999 }, { updatedAt: 100 }, false)).toBe(true);
		expect(shouldAdoptServerSettings({ updatedAt: 100 }, { updatedAt: 100 }, false)).toBe(false);
	});
});
