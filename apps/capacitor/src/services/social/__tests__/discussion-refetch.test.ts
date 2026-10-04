import type { DiscussionPage } from "@lesefluss/core";
import { describe, expect, test } from "vitest";
import { shouldRefetchDiscussion } from "../buddy-read-discussion";

describe("shouldRefetchDiscussion", () => {
	const page = { nextUnlockWord: 1000 };

	test("waits until the reader reaches where the nearest hidden item unlocks", () => {
		expect(shouldRefetchDiscussion(page, 999, null)).toBe(false);
		expect(shouldRefetchDiscussion(page, 1000, null)).toBe(true);
	});

	test("does not retry at the same spot when a push did not move the server", () => {
		expect(shouldRefetchDiscussion(page, 1050, 1000)).toBe(false);
		expect(shouldRefetchDiscussion(page, 1100, 1000)).toBe(true);
	});

	test("never refetches when nothing is hidden", () => {
		expect(shouldRefetchDiscussion({ nextUnlockWord: null }, 5000, null)).toBe(false);
	});

	test("never refetches against a server that does not send the field", () => {
		const legacy = {} as Pick<DiscussionPage, "nextUnlockWord">;
		expect(shouldRefetchDiscussion(legacy, 5000, null)).toBe(false);
	});
});
