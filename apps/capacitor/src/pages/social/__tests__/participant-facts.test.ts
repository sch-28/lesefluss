import type { BuddyReadParticipant } from "@lesefluss/core";
import { describe, expect, it } from "vitest";
import { participantFacts } from "../buddy-read";

const reader = (over: Partial<BuddyReadParticipant> = {}): BuddyReadParticipant => ({
	identity: { userId: "u2", handle: "bo", name: "Bo", avatarUrl: null },
	isSelf: false,
	isHost: false,
	isFriend: true,
	relationship: "friends",
	wordPosition: 0,
	wordCount: null,
	percent: null,
	finishedAt: null,
	lastActiveAt: null,
	...over,
});

const at = { chapterTitle: "Chapter One", myPosition: 500, approximate: false };

describe("participantFacts", () => {
	it("shows no chapter or place relative to you while progress is unknown", () => {
		expect(participantFacts(reader(), at)).toEqual(["Progress unknown"]);
	});

	it("shows percent, chapter and place once progress is known", () => {
		expect(participantFacts(reader({ percent: 40, wordPosition: 800 }), at)).toEqual([
			"40%",
			"Chapter One",
			"ahead of you",
		]);
	});

	it("keeps the chapter of a finished reader", () => {
		expect(
			participantFacts(reader({ finishedAt: 1, wordPosition: 900 }), {
				...at,
				chapterTitle: "Epilogue",
			}),
		).toEqual(["Epilogue", "ahead of you"]);
	});
});
