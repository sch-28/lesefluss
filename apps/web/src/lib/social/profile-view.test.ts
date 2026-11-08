import { describe, expect, it } from "vitest";
import { isSectionShown, milestonesForFriends } from "./profile-view";

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
