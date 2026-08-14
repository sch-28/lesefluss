import { describe, expect, it } from "vitest";
import type { BulkOutcome } from "../../../services/db/hooks/use-bulk-books";
import { bookCount, bulkSummary, titleList } from "../bulk-summary";

function outcome(over: Partial<BulkOutcome> = {}): BulkOutcome {
	return { kind: "delete", succeeded: 0, failures: [], ...over };
}

const failure = (title: string) => ({ title, reason: "Couldn't delete this book" });

describe("bookCount", () => {
	it("uses the singular for one", () => {
		expect(bookCount(1)).toBe("1 book");
		expect(bookCount(0)).toBe("0 books");
		expect(bookCount(12)).toBe("12 books");
	});
});

describe("titleList", () => {
	// The delete confirm names books rather than only counting them, because a
	// selection survives a filter change and can hold books that are off screen.
	it("puts each title on its own line", () => {
		expect(titleList(["Dune", "Emma"])).toBe("Dune\nEmma");
	});

	it("truncates a long list to a glanceable few", () => {
		const titles = ["A", "B", "C", "D", "E", "F", "G"];
		const listed = titleList(titles);
		expect(listed).toContain("E");
		expect(listed).not.toContain("F");
		expect(listed.split("\n").at(-1)).toBe("and 2 more");
	});

	it("adds no trailer when everything fits", () => {
		expect(titleList(["A"])).toBe("A");
		expect(titleList([])).toBe("");
	});
});

describe("bulkSummary", () => {
	it("reports a clean run with no detail to explain", () => {
		const summary = bulkSummary(outcome({ succeeded: 3 }));
		expect(summary).toEqual({ headline: "Deleted 3 books", hasFailures: false });
	});

	it("uses the singular for one book", () => {
		expect(bulkSummary(outcome({ succeeded: 1 })).headline).toBe("Deleted 1 book");
	});

	it("names the action", () => {
		expect(bulkSummary(outcome({ kind: "status", succeeded: 2 })).headline).toBe("Updated 2 books");
	});

	it("reports a partial run as a count out of the total attempted", () => {
		const summary = bulkSummary(outcome({ succeeded: 9, failures: [failure("A"), failure("B")] }));
		expect(summary.headline).toBe("Deleted 9 of 11");
		expect(summary.hasFailures).toBe(true);
		expect(summary.detail).toContain('"A"');
		expect(summary.detail).toContain('"B"');
	});

	it("lists why each book failed, not just that it did", () => {
		const summary = bulkSummary(
			outcome({
				succeeded: 1,
				failures: [{ title: "Dune", reason: "Too many tags on this book" }],
			}),
		);
		expect(summary.detail).toBe('"Dune" — Too many tags on this book');
	});

	it("collapses a long failure list", () => {
		const failures = ["A", "B", "C", "D", "E", "F", "G"].map(failure);
		const summary = bulkSummary(outcome({ succeeded: 0, failures }));
		expect(summary.detail).toContain('"E"');
		expect(summary.detail).not.toContain('"F"');
		expect(summary.detail).toContain("and 2 more");
	});

	// A reader who confirmed "Delete 2 books?" must not be told the update failed.
	it("uses the failed action's own verb", () => {
		const failures = [failure("A"), failure("B")];
		expect(bulkSummary(outcome({ kind: "delete", succeeded: 0, failures })).headline).toBe(
			"Couldn't delete 2 books",
		);
		expect(bulkSummary(outcome({ kind: "status", succeeded: 0, failures })).headline).toBe(
			"Couldn't update 2 books",
		);
	});

	it("does not claim any success when everything failed", () => {
		const summary = bulkSummary(outcome({ succeeded: 0, failures: [failure("A"), failure("B")] }));
		expect(summary.headline).not.toMatch(/Deleted \d/);
	});

	it("handles a single total failure", () => {
		expect(bulkSummary(outcome({ succeeded: 0, failures: [failure("A")] })).headline).toBe(
			"Couldn't delete this book",
		);
	});
});
