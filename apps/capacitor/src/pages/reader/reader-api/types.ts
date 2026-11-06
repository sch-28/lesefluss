import type { SaveSource } from "../../../test-hooks/reader";

export type ReaderMode = "scroll" | "page" | "rsvp";

export type UserNavigateSource = Exclude<
	SaveSource,
	"recovered" | "kept-local" | "adopted" | "unmount" | "pagehide"
>;

export type WordRange = { start: number; end: number };

/** The only way reader features reach the reader; a renderer implements it, features never read its refs. */
export interface ReaderApi {
	/** A programmatic jump; from RSVP it lands in the standard view. */
	goToWord(word: number): void;
	/** The first and last word on screen, both inclusive; null before the view has laid out. */
	visibleWords(): { first: number; last: number } | null;
	/** Client rects of the words in the range that are in the DOM now, one per line fragment; empty in RSVP. */
	rectsFor(range: WordRange): DOMRect[];
	/**
	 * Fires for every user-intent position save, once the save has started and before
	 * the view has moved; a save of an unchanged word fires too. Returns the unsubscribe.
	 */
	onUserNavigate(cb: (word: number, source: UserNavigateSource) => void): () => void;
	currentWord(): number;
	readonly mode: ReaderMode;
}
