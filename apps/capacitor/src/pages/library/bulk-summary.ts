/**
 * What a finished bulk action says to the reader.
 *
 * Pure so the pluralisation and the partial-failure wording are testable; the
 * page only decides whether to toast it or open a dialog.
 */

import type { BulkOutcome } from "../../services/db/hooks/use-bulk-books";

/** Items listed in full before collapsing into a count. */
const MAX_LISTED = 5;

export type BulkSummary = {
	headline: string;
	/** Absent on a clean run, which needs no explaining. */
	detail?: string;
	hasFailures: boolean;
};

/** "1 book" / "12 books". Also used for the sheet and dialog titles. */
export function bookCount(count: number): string {
	return count === 1 ? "1 book" : `${count} books`;
}

function verb(kind: BulkOutcome["kind"]): string {
	return kind === "delete" ? "Deleted" : "Updated";
}

function failedVerb(kind: BulkOutcome["kind"]): string {
	return kind === "delete" ? "delete" : "update";
}

/** One per line, truncated to a glanceable few. Shared by the lists below. */
function briefList(lines: readonly string[]): string {
	const listed = lines.slice(0, MAX_LISTED);
	const rest = lines.length - listed.length;
	return rest > 0 ? [...listed, `and ${rest} more`].join("\n") : listed.join("\n");
}

/**
 * The books an action is about to touch, named rather than counted.
 *
 * A selection survives a filter change, so the reader can be holding books that
 * are not on screen. Naming a few is what makes a destructive confirm honest
 * without a warning about hidden books.
 */
export function titleList(titles: readonly string[]): string {
	return briefList(titles);
}

function listFailures(failures: BulkOutcome["failures"]): string {
	return briefList(failures.map((failure) => `"${failure.title}" — ${failure.reason}`));
}

export function bulkSummary(outcome: BulkOutcome): BulkSummary {
	const { succeeded, failures, kind } = outcome;

	if (failures.length === 0) {
		return { headline: `${verb(kind)} ${bookCount(succeeded)}`, hasFailures: false };
	}

	if (succeeded === 0) {
		return {
			headline:
				failures.length === 1
					? `Couldn't ${failedVerb(kind)} this book`
					: `Couldn't ${failedVerb(kind)} ${bookCount(failures.length)}`,
			detail: listFailures(failures),
			hasFailures: true,
		};
	}

	return {
		headline: `${verb(kind)} ${succeeded} of ${succeeded + failures.length}`,
		detail: listFailures(failures),
		hasFailures: true,
	};
}
