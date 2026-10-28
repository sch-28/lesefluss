import { describe, expect, it } from "vitest";
import { formatBytes } from "../../../utils/format-bytes";
import { notBackedUpMessage, syncedWithBlockedMessage } from "../cloud-storage";

describe("formatBytes", () => {
	it("uses binary units with one decimal", () => {
		expect(formatBytes(500 * 1024 * 1024)).toBe("500.0 MB");
		expect(formatBytes(12.34 * 1024 * 1024)).toBe("12.3 MB");
		expect(formatBytes(1.5 * 1024 ** 3)).toBe("1.5 GB");
	});

	it("never shows 0.0 of a unit", () => {
		expect(formatBytes(0)).toBe("0 B");
		expect(formatBytes(512)).toBe("512 B");
	});

	it("moves up a unit when the rounded value would read 1024", () => {
		expect(formatBytes(1023.96 * 1024 * 1024)).toBe("1.0 GB");
		expect(formatBytes(1023.9 * 1024 * 1024)).toBe("1023.9 MB");
	});
});

describe("not-backed-up messages", () => {
	const book = (title: string) => ({ id: title, title });

	it("names one or two books", () => {
		expect(notBackedUpMessage([book("Dune")])).toBe(
			'Not enough cloud storage. Not backed up: "Dune".',
		);
		expect(notBackedUpMessage([book("Dune"), book("Emma")])).toBe(
			'Not enough cloud storage. Not backed up: "Dune" and "Emma".',
		);
	});

	it("counts the rest beyond two", () => {
		expect(notBackedUpMessage([book("Dune"), book("Emma"), book("Ulysses")])).toBe(
			'Not enough cloud storage. Not backed up: "Dune", "Emma" and 1 more.',
		);
	});

	it("counts every blocked book after a manual sync", () => {
		expect(syncedWithBlockedMessage(1)).toBe(
			"Synced. 1 book isn't backed up: not enough cloud storage.",
		);
		expect(syncedWithBlockedMessage(3)).toBe(
			"Synced. 3 books aren't backed up: not enough cloud storage.",
		);
	});
});
