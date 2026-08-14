import type { BookFileFormat, BookProbe } from "@lesefluss/book-import";
import { describe, expect, it } from "vitest";
import type { ScannedFile } from "../../../../services/book-import";
import {
	applyProbe,
	type Candidate,
	candidateTitle,
	formatCounts,
	isDuplicate,
	normalizeTitle,
	setSelection,
	toCandidates,
	toggleCandidate,
} from "../candidates";

// Ids are readable here so the cases below can name candidates directly. Their
// real construction, and the uniqueness that matters, is tested in
// `services/book-import/__tests__/folder-scan.test.ts`.
function file(relativePath: string, format: BookFileFormat = "epub"): ScannedFile {
	return {
		id: relativePath,
		name: relativePath.slice(relativePath.lastIndexOf("/") + 1),
		relativePath,
		size: 1000,
		format,
		handle: { kind: "uri", uri: `content://${relativePath}` },
	};
}

function probe(over: Partial<BookProbe> = {}): BookProbe {
	return { title: "Probed", author: null, coverImage: null, format: "epub", ...over };
}

const library = (...titles: string[]) => new Set(titles.map(normalizeTitle));

describe("candidateTitle", () => {
	it("shows the filename until the probe lands, then the probed title", () => {
		const [candidate] = toCandidates([file("Brown/Red Rising.epub")]);
		expect(candidateTitle(candidate)).toBe("Red Rising");

		const [probed] = applyProbe(
			[candidate],
			"Brown/Red Rising.epub",
			probe({ title: "Red Rising: Book 1" }),
			library(),
		);
		expect(candidateTitle(probed)).toBe("Red Rising: Book 1");
	});
});

describe("normalizeTitle", () => {
	it("ignores case and collapses whitespace", () => {
		expect(normalizeTitle("  The   Iliad ")).toBe(normalizeTitle("the iliad"));
	});

	// Punctuation is kept: "Vol. 1" and "Vol 1" may be different books, and a
	// false duplicate deselects something the reader wanted.
	it("keeps punctuation significant", () => {
		expect(normalizeTitle("Vol. 1")).not.toBe(normalizeTitle("Vol 1"));
	});
});

describe("applyProbe", () => {
	it("deselects a candidate whose probed title is already in the library", () => {
		const candidates = toCandidates([file("a.epub")]);
		expect(candidates[0].selected).toBe(true);

		const [after] = applyProbe(
			candidates,
			"a.epub",
			probe({ title: "Morning Star" }),
			library("morning star"),
		);
		expect(after.selected).toBe(false);
	});

	it("leaves a non-duplicate selected", () => {
		const [after] = applyProbe(
			toCandidates([file("a.epub")]),
			"a.epub",
			probe({ title: "Iron Gold" }),
			library("morning star"),
		);
		expect(after.selected).toBe(true);
	});

	// The reader's choice outranks a probe that lands afterwards.
	it("does not override a candidate the reader already toggled", () => {
		const toggled = toggleCandidate(toCandidates([file("a.epub")]), "a.epub");
		expect(toggled[0].selected).toBe(false);

		const [after] = applyProbe(toggled, "a.epub", probe({ title: "Iron Gold" }), library());
		expect(after.selected).toBe(false);
	});

	it("keeps a manually selected duplicate selected", () => {
		const toggledOff = toggleCandidate(toCandidates([file("a.epub")]), "a.epub");
		const toggledOn = toggleCandidate(toggledOff, "a.epub");

		const [after] = applyProbe(
			toggledOn,
			"a.epub",
			probe({ title: "Morning Star" }),
			library("morning star"),
		);
		expect(after.selected).toBe(true);
	});

	it("only touches the candidate it names", () => {
		const candidates = toCandidates([file("a.epub"), file("b.epub")]);
		const after = applyProbe(candidates, "a.epub", probe(), library());
		expect(after[0].probe).toBeDefined();
		expect(after[1].probe).toBeUndefined();
	});
});

describe("isDuplicate", () => {
	it("matches on the filename before a probe has landed", () => {
		const [candidate] = toCandidates([file("Morning Star.epub")]);
		expect(isDuplicate(candidate, library("morning star"))).toBe(true);
	});
});

describe("setSelection", () => {
	it("applies to one format only when given one", () => {
		const candidates = toCandidates([file("a.epub"), file("b.pdf", "pdf")]);
		const after = setSelection(candidates, false, "pdf");
		expect(after.map((c) => c.selected)).toEqual([true, false]);
	});

	it("applies to everything when given no format", () => {
		const after = setSelection(toCandidates([file("a.epub"), file("b.pdf", "pdf")]), false);
		expect(after.every((c) => !c.selected)).toBe(true);
	});

	// Otherwise a probe landing after "select none" would quietly re-select.
	it("counts as a manual choice", () => {
		const after = setSelection(toCandidates([file("a.epub")]), false);
		const [probed] = applyProbe(after, "a.epub", probe({ title: "Iron Gold" }), library());
		expect(probed.selected).toBe(false);
	});
});

describe("formatCounts", () => {
	it("tallies selected against total per format", () => {
		let candidates: Candidate[] = toCandidates([
			file("a.epub"),
			file("b.epub"),
			file("c.pdf", "pdf"),
		]);
		candidates = toggleCandidate(candidates, "b.epub");

		expect(formatCounts(candidates)).toEqual([
			{ format: "epub", total: 2, selected: 1 },
			{ format: "pdf", total: 1, selected: 1 },
		]);
	});
});
