/**
 * Pure candidate-list logic for a folder import: what the review grid shows,
 * what is selected, and what is already in the library.
 *
 * Kept apart from the hook so the parts that can actually be wrong are testable
 * without mounting a sheet.
 */

import type { BookFileFormat, BookProbe } from "@lesefluss/book-import";
import { titleFromFileName } from "@lesefluss/book-import";
import type { ScannedFile } from "../../../services/book-import";

export type Candidate = {
	file: ScannedFile;
	/** Absent until the file has been probed; the grid renders before that. */
	probe?: BookProbe;
	selected: boolean;
	/**
	 * Set once the reader toggles this card. A probe landing afterwards must not
	 * silently undo a deliberate choice.
	 */
	touched: boolean;
	/** What All / None last asked for; an untouched card is selected when this
	 *  holds and it is no duplicate. */
	wanted: boolean;
};

/** Identity within one scan. See `ScannedFile.id` for why the path won't do. */
export function candidateKey(candidate: Candidate): string {
	return candidate.file.id;
}

/** What the card shows: the probed title once known, the filename until then. */
export function candidateTitle(candidate: Candidate): string {
	return candidate.probe?.title ?? titleFromFileName(candidate.file.name);
}

/**
 * Titles are compared case-insensitively with runs of whitespace collapsed, so
 * "The  Iliad" and "the iliad" count as the same book. Deliberately not
 * punctuation-insensitive: "Vol. 1" and "Vol 1" are plausibly different books,
 * and a false duplicate silently deselects something the reader wanted.
 */
export function normalizeTitle(title: string): string {
	return title.trim().replace(/\s+/g, " ").toLowerCase();
}

export function isDuplicate(candidate: Candidate, existingTitles: ReadonlySet<string>): boolean {
	return existingTitles.has(normalizeTitle(candidateTitle(candidate)));
}

export function toCandidates(
	files: ScannedFile[],
	existingTitles: ReadonlySet<string> = new Set(),
): Candidate[] {
	return files.map((file) => {
		const candidate: Candidate = { file, selected: true, touched: false, wanted: true };
		return { ...candidate, selected: !isDuplicate(candidate, existingTitles) };
	});
}

/**
 * Attach a probe result to one candidate, deselecting it if the probed title
 * turns out to name a book already in the library. An untouched card follows
 * what the probe reveals; a touched one keeps whatever the reader chose.
 */
export function applyProbe(
	candidates: Candidate[],
	key: string,
	probe: BookProbe,
	existingTitles: ReadonlySet<string>,
): Candidate[] {
	return candidates.map((candidate) => {
		if (candidateKey(candidate) !== key) return candidate;
		const probed: Candidate = { ...candidate, probe };
		if (probed.touched) return probed;
		return { ...probed, selected: probed.wanted && !isDuplicate(probed, existingTitles) };
	});
}

export function toggleCandidate(candidates: Candidate[], key: string): Candidate[] {
	return candidates.map((candidate) =>
		candidateKey(candidate) === key
			? { ...candidate, selected: !candidate.selected, touched: true }
			: candidate,
	);
}

/**
 * Select or deselect every candidate, or every candidate of one format.
 * Duplicates stay unticked, now and when a later probe reveals one; only a
 * tap on the card itself picks a duplicate.
 */
export function setSelection(
	candidates: Candidate[],
	selected: boolean,
	existingTitles: ReadonlySet<string>,
	format?: BookFileFormat,
): Candidate[] {
	return candidates.map((candidate) =>
		format === undefined || candidate.file.format === format
			? {
					...candidate,
					selected: selected && !isDuplicate(candidate, existingTitles),
					touched: false,
					wanted: selected,
				}
			: candidate,
	);
}

export type FormatCount = { format: BookFileFormat; total: number; selected: number };

/** Per-format tallies for the filter chips, in first-seen order. */
export function formatCounts(candidates: Candidate[]): FormatCount[] {
	const counts = new Map<BookFileFormat, FormatCount>();
	for (const candidate of candidates) {
		const entry = counts.get(candidate.file.format) ?? {
			format: candidate.file.format,
			total: 0,
			selected: 0,
		};
		entry.total += 1;
		if (candidate.selected) entry.selected += 1;
		counts.set(candidate.file.format, entry);
	}
	return [...counts.values()];
}
