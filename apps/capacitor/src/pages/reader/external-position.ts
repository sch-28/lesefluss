import type { PositionRow } from "../../services/db/queries/books";

/**
 * What the open reader does with a book row newer than it has seen (a sync pull,
 * a lost write, a pull merge that found the reader's own write newer):
 * - ignore: not newer than what the reader has seen;
 * - advance: the reader's own write, or the word it is already on; nothing to show;
 * - keep: the reader is newer; its word is written over the row;
 * - adopt: the reader moves to the row's word.
 *
 * No clocks are compared across devices: the reader is newer only when it moved
 * since its last landed save or adopt, when RSVP or the voice is playing, or when
 * a pull skipped the row because the reader's playback had just saved.
 */
export type ExternalDecision = "ignore" | "advance" | "keep" | "adopt";

export type ExternalPositionState = {
	/** The newest revision of the row this reader has seen. */
	seenRev: number;
	/** Revisions this device wrote itself. */
	isOwnRevision: (rev: number) => boolean;
	/** The reader's position: the browse anchor while browsing, else the current word. */
	ourWord: number | null;
	hasLocalMove: boolean;
	isRsvpPlaying: boolean;
	isReadAloudPlaying: boolean;
	/** A pull skipped the row for the reader's newer RSVP or read-aloud save, with no move since. */
	isSkippedForPlaybackSave: boolean;
};

export function decideExternalPosition(
	row: PositionRow | null,
	state: ExternalPositionState,
): ExternalDecision {
	if (!row || row.updatedAt <= state.seenRev) return "ignore";
	if (state.isOwnRevision(row.updatedAt) || row.wordPosition === state.ourWord) return "advance";
	if (
		state.hasLocalMove ||
		state.isRsvpPlaying ||
		state.isReadAloudPlaying ||
		state.isSkippedForPlaybackSave
	) {
		return "keep";
	}
	return "adopt";
}

/** A word from another device, inside this copy of the book. */
export function clampWord(word: number, wordCount: number): number {
	return Math.min(Math.max(word, 0), Math.max(wordCount - 1, 0));
}
