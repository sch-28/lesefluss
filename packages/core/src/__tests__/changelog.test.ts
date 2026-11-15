import { describe, expect, test } from "vitest";
import { changelog, changelogEntryKey } from "../changelog";

describe("changelogEntryKey", () => {
	test("is unique across the changelog, also for entries that share a date", () => {
		const keys = changelog.map(changelogEntryKey);
		expect(new Set(keys).size).toBe(keys.length);
		expect(new Set(changelog.map((e) => e.date)).size).toBeLessThan(changelog.length);
	});
});
