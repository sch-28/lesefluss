import { beforeEach, describe, expect, it } from "vitest";
import { readPersistedString, writePersistedString } from "./use-persistent-string";

type Mode = "grid" | "list";
const isMode = (v: string): v is Mode => v === "grid" || v === "list";
const KEY = "test:view-mode";

describe("persisted string preference", () => {
	beforeEach(() => localStorage.clear());

	it("returns the fallback when nothing is stored", () => {
		expect(readPersistedString(KEY, isMode, "grid")).toBe("grid");
	});

	it("restores a previously written value (survives a reload)", () => {
		writePersistedString(KEY, "list");
		expect(readPersistedString(KEY, isMode, "grid")).toBe("list");
	});

	it("ignores an invalid stored value and uses the fallback", () => {
		localStorage.setItem(KEY, "spreadsheet");
		expect(readPersistedString(KEY, isMode, "grid")).toBe("grid");
	});
});
