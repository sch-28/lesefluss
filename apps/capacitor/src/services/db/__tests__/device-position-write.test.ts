import { wordPos } from "@lesefluss/core";
import { describe, expect, it } from "vitest";
import { recoverPendingWord } from "../../../pages/reader/pending-position";
import { devicePositionWrite } from "../queries/books";

describe("devicePositionWrite", () => {
	const now = 1_000_000;
	// The row was last written by a device whose clock runs ahead of this one.
	const rowRevision = now + 60_000;

	it("stamps the revision above the row's and lastRead with this device's clock", () => {
		expect(devicePositionWrite(wordPos(500), now, rowRevision)).toEqual({
			wordPosition: 500,
			lastRead: now,
			updatedAt: rowRevision + 1,
		});
	});

	it("leaves a later unsaved read on a clock-behind device recoverable", () => {
		const { wordPosition, lastRead } = devicePositionWrite(wordPos(500), now, rowRevision);
		// The reader moved on and the app was killed before its write landed.
		const pending = { word: 620, at: now + 5_000 };

		expect(recoverPendingWord(wordPosition, lastRead, pending)).toBe(620);
	});
});
