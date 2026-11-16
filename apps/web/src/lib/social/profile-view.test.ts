import { describe, expect, it } from "vitest";
import { isSectionShown, milestonesForFriends, shelvesFromRows } from "./profile-view";

describe("isSectionShown", () => {
	it("hides milestones from friends once the owner turns them off", () => {
		const profile = { showStats: true, showMilestones: false };
		expect(isSectionShown(profile, "milestones", false)).toBe(false);
		expect(isSectionShown(profile, "stats", false)).toBe(true);
	});

	it("hides milestones from friends while reading stats are off, whatever their own toggle", () => {
		const profile = { showStats: false, showMilestones: true };
		expect(isSectionShown(profile, "milestones", false)).toBe(false);
		expect(isSectionShown(profile, "milestones", true)).toBe(true);
	});

	it("always shows the owner their own milestones", () => {
		expect(isSectionShown({ showMilestones: false }, "milestones", true)).toBe(true);
	});

	it("shows milestones by default, without a profile row too", () => {
		expect(isSectionShown(undefined, "milestones", false)).toBe(true);
		expect(isSectionShown({ showMilestones: true }, "milestones", false)).toBe(true);
	});
});

describe("milestonesForFriends", () => {
	const owned = {
		reached: [
			{ kind: "words" as const, threshold: 1_000_000, reachedAt: Date.UTC(2026, 10, 3, 1, 47) },
		],
		next: [{ kind: "words" as const, threshold: 2_000_000, current: 1_234_567 }],
	};

	it("leaves out the owner's exact totals", () => {
		expect(milestonesForFriends(owned, "UTC").next).toEqual([]);
	});

	it("dates a reached tier by the owner's day, not the hour they read", () => {
		const [berlin] = milestonesForFriends(owned, "Europe/Berlin").reached;
		expect(berlin).toMatchObject({ kind: "words", threshold: 1_000_000 });
		expect(berlin.reachedAt).toBe(Date.UTC(2026, 10, 3, 12));
		const [la] = milestonesForFriends(owned, "America/Los_Angeles").reached;
		expect(la.reachedAt).toBe(Date.UTC(2026, 10, 2, 12));
	});
});

describe("shelvesFromRows", () => {
	const row = (over: Partial<Parameters<typeof shelvesFromRows>[0][number]>) => ({
		userId: "owner",
		bookId: "b1",
		title: "Book",
		author: null,
		wordCount: 1000,
		wordPosition: 0,
		status: null,
		rating: null,
		finishedAt: null,
		firstSittingAt: new Date("2026-10-31T10:00:00Z") as Date | null,
		catalogId: "gutenberg:1",
		updatedAt: new Date("2026-11-01T10:00:00Z"),
		hasCover: false,
		seriesId: null,
		seriesTitle: null,
		seriesAuthor: null,
		seriesHasCover: false,
		...over,
	});
	const reading = (rows: Parameters<typeof shelvesFromRows>[0]) =>
		shelvesFromRows(rows, "owner", "viewer", undefined).currentlyReading.map((b) => b.key);

	it("lists only books on the Reading shelf, most recently moved first", () => {
		expect(
			reading([
				row({ bookId: "unopened" }),
				row({ bookId: "older", wordPosition: 10 }),
				row({
					bookId: "newer",
					wordPosition: 10,
					updatedAt: new Date("2026-11-02T10:00:00Z"),
				}),
				row({ bookId: "dropped", wordPosition: 500, status: "dropped" }),
				row({ bookId: "want", wordPosition: 500, status: "want" }),
			]),
		).toEqual(["newer", "older"]);
	});

	it("keeps a book only glanced at, with a position but no real sitting, off the Reading shelf", () => {
		expect(
			reading([
				row({ bookId: "glanced", wordPosition: 10, firstSittingAt: null }),
				row({ bookId: "read", wordPosition: 10 }),
			]),
		).toEqual(["read"]);
	});

	it("keeps a series whose chapters were set aside off the Reading shelf", () => {
		expect(
			reading([
				row({
					bookId: "c1",
					seriesId: "s1",
					seriesTitle: "Serial",
					wordPosition: 400,
					status: "dropped",
				}),
				row({ bookId: "c2", seriesId: "s1", seriesTitle: "Serial" }),
			]),
		).toEqual([]);
	});
});
