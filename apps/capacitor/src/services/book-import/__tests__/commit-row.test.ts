import type { BookPayload } from "@lesefluss/book-import";
import { describe, expect, it } from "vitest";
import { buildImportedBookRow } from "../commit";
import type { ImportOverrides } from "../types";

const payload: BookPayload = {
	content: "body text",
	title: "Microsoft Word - draft3.docx",
	author: "Unknown",
	fileFormat: "pdf",
};

const stamps = { id: "deadbeef", addedAt: 1000, size: 9 };

function makeOverrides(over: Partial<ImportOverrides> = {}): ImportOverrides {
	return {
		title: "The Raven",
		author: "Edgar Allan Poe",
		description: null,
		language: null,
		status: null,
		rating: null,
		review: null,
		tags: null,
		...over,
	};
}

describe("buildImportedBookRow", () => {
	// The whole point of the confirm step: what the reader typed beats what the
	// parser guessed, and a PDF that parsed its title from a filename is exactly
	// the case it exists for.
	it("takes the reader's corrections over the parsed values", () => {
		const row = buildImportedBookRow(payload, {}, makeOverrides(), stamps);
		expect(row.title).toBe("The Raven");
		expect(row.author).toBe("Edgar Allan Poe");
	});

	it("carries the metadata the reader set while confirming", () => {
		const row = buildImportedBookRow(
			payload,
			{},
			makeOverrides({
				status: "want",
				rating: 7,
				tags: '["poetry"]',
				description: "A blurb",
				review: "Notes",
				language: "en",
			}),
			stamps,
		);
		expect(row).toMatchObject({
			status: "want",
			rating: 7,
			tags: '["poetry"]',
			description: "A blurb",
			review: "Notes",
			language: "en",
		});
	});

	// An author cleared in the sheet must stay cleared rather than falling back
	// to the parser's guess.
	it("honours a cleared author instead of reviving the parsed one", () => {
		const row = buildImportedBookRow(payload, {}, makeOverrides({ author: null }), stamps);
		expect(row.author).toBeNull();
	});

	// The catalog commits without showing the sheet.
	it("keeps the parsed values when no corrections were made", () => {
		const row = buildImportedBookRow(payload, {}, undefined, stamps);
		expect(row.title).toBe("Microsoft Word - draft3.docx");
		expect(row.author).toBe("Unknown");
		expect(row.status).toBeNull();
		expect(row.rating).toBeNull();
	});

	it("passes source attribution through untouched", () => {
		const row = buildImportedBookRow(
			payload,
			{ source: "url", sourceUrl: "https://example.test/a" },
			makeOverrides(),
			stamps,
		);
		expect(row.source).toBe("url");
		expect(row.sourceUrl).toBe("https://example.test/a");
	});

	it("stamps both revisions from the import time", () => {
		const row = buildImportedBookRow(payload, {}, undefined, stamps);
		expect(row.updatedAt).toBe(1000);
		expect(row.metadataUpdatedAt).toBe(1000);
	});
});
