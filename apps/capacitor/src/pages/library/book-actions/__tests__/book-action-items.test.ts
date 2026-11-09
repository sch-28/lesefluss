import { describe, expect, it } from "vitest";
import { bookActionIds, omitsDestructive, opensReader, statusChoices } from "../book-action-items";

describe("bookActionIds", () => {
	it("lists every action in the one order, Delete last", () => {
		expect(bookActionIds({ canShare: true, canSelect: true, hasExtras: false })).toEqual([
			"open",
			"status",
			"rate",
			"series",
			"collection",
			"edit",
			"share",
			"reset",
			"select",
			"delete",
		]);
	});

	it("drops Share signed out and Select outside the library, keeping the order", () => {
		expect(bookActionIds({ canShare: false, canSelect: false, hasExtras: true })).toEqual([
			"open",
			"status",
			"rate",
			"series",
			"collection",
			"edit",
			"reset",
			"extras",
			"delete",
		]);
	});
});

describe("destructive actions", () => {
	it("leave the reader and book page menus for the book page's danger zone", () => {
		expect(omitsDestructive("reader")).toBe(true);
		expect(omitsDestructive("detail")).toBe(true);
		expect(omitsDestructive("card")).toBe(false);
		const ids = bookActionIds({
			canShare: true,
			canSelect: false,
			hasExtras: false,
			omitsDestructive: true,
		});
		expect(ids).not.toContain("reset");
		expect(ids).not.toContain("delete");
		expect(ids).toContain("edit");
	});
});

describe("opensReader", () => {
	it("offers Continue where a tap opens the detail page, Details where it opens the reader", () => {
		expect(opensReader("detail")).toBe(true);
		expect(opensReader("stats")).toBe(true);
		expect(opensReader("card")).toBe(false);
		expect(opensReader("reader")).toBe(false);
	});
});

describe("statusChoices", () => {
	it("leads with Automatic and what it makes of the book, then the shelves", () => {
		expect(statusChoices(null, "reading")).toEqual([
			{ status: null, label: "Automatic · Reading", isCurrent: true },
			{ status: "want", label: "Want to read", isCurrent: false },
			{ status: "reading", label: "Reading", isCurrent: false },
			{ status: "finished", label: "Finished", isCurrent: false },
			{ status: "dropped", label: "Dropped", isCurrent: false },
		]);
	});

	it("marks the status the reader set", () => {
		const current = statusChoices("dropped", "reading").filter((c) => c.isCurrent);
		expect(current.map((c) => c.status)).toEqual(["dropped"]);
	});
});
