import { type BookStatus, parseBookTags, serializeBookTags } from "@lesefluss/core";
import { clampBookTags, FIELD_LIMITS } from "./book-fields";

/**
 * The editable half of a book. Deliberately not a `Book`: the import page edits
 * a payload that has no database row yet, and a reading position is not
 * something the form touches.
 */
export type BookEditValues = {
	title: string;
	author: string | null;
	description: string | null;
	language: string | null;
	status: BookStatus | null;
	rating: number | null;
	review: string | null;
	tags: string[];
	hideFromProfile: boolean;
};

/** Reader-editable values clamped to what sync will accept. */
export function clampToFieldLimits(values: BookEditValues): BookEditValues {
	const cap = (text: string | null, max: number) => (text ? text.slice(0, max) : text);
	const { tags } = clampBookTags(values.tags);
	return {
		...values,
		title: values.title.slice(0, FIELD_LIMITS.title),
		author: cap(values.author, FIELD_LIMITS.author),
		description: cap(values.description, FIELD_LIMITS.description),
		review: cap(values.review, FIELD_LIMITS.review),
		language: cap(values.language, FIELD_LIMITS.language),
		tags,
	};
}

/** `Book` row to the form's value shape. */
export function bookToEditValues(book: {
	title: string;
	author: string | null;
	description: string | null;
	language: string | null;
	status: BookStatus | null;
	rating: number | null;
	review: string | null;
	tags: string | null;
	hideFromProfile: boolean;
}): BookEditValues {
	return {
		title: book.title,
		author: book.author,
		description: book.description,
		language: book.language,
		status: book.status,
		rating: book.rating,
		review: book.review,
		tags: parseBookTags(book.tags),
		hideFromProfile: book.hideFromProfile,
	};
}

/**
 * The form's value shape as a `updateBook` patch. It never carries the series
 * hint: a wrong series is fixed by moving the book between collections.
 */
export function editValuesToPatch(values: BookEditValues) {
	const clamped = clampToFieldLimits(values);
	return { ...clamped, tags: serializeBookTags(clamped.tags) };
}

/** What Save stores: the values with the title trimmed and a typed but
 *  uncommitted tag kept, since the reader expects it saved. */
export function finalizeEditValues(values: BookEditValues, tagDraft: string): BookEditValues {
	const label = tagDraft.trim();
	const tags = label && !values.tags.includes(label) ? [...values.tags, label] : values.tags;
	return { ...values, title: values.title.trim(), tags };
}

export function isEditDirty(
	initial: BookEditValues,
	values: BookEditValues,
	tagDraft: string,
): boolean {
	if (tagDraft.trim()) return true;
	return (Object.keys(initial) as (keyof BookEditValues)[]).some((key) =>
		key === "tags"
			? initial.tags.join("\u0000") !== values.tags.join("\u0000")
			: initial[key] !== values[key],
	);
}

/** The ordered collection the book sits in, as stored. */
export type SeriesMembership = { collectionId: string; seriesIndex: number | null };

/** The series row's state: an existing collection, a new one by name, or none. */
export type SeriesChoice =
	| { kind: "none" }
	| { kind: "collection"; collectionId: string; index: number | null }
	| { kind: "new"; name: string; index: number | null };

export type SeriesPlan = {
	/** Tombstoned, which is also what keeps the series backfill from re-adding it. */
	remove: string | null;
	add:
		| { kind: "collection"; collectionId: string; index: number | null }
		| { kind: "new"; name: string; index: number | null }
		| null;
};

export function seriesChoiceOf(membership: SeriesMembership | null): SeriesChoice {
	return membership
		? { kind: "collection", collectionId: membership.collectionId, index: membership.seriesIndex }
		: { kind: "none" };
}

export function isSeriesDirty(membership: SeriesMembership | null, choice: SeriesChoice): boolean {
	const plan = planSeriesChange(membership, choice);
	return plan.remove !== null || plan.add !== null;
}

export function planSeriesChange(
	membership: SeriesMembership | null,
	choice: SeriesChoice,
): SeriesPlan {
	const current = membership?.collectionId ?? null;
	if (choice.kind === "none") return { remove: current, add: null };
	if (choice.kind === "new") return { remove: current, add: choice };
	if (choice.collectionId === current) {
		return choice.index === (membership?.seriesIndex ?? null)
			? { remove: null, add: null }
			: { remove: null, add: choice };
	}
	return { remove: current, add: choice };
}
