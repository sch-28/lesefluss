import type { BookPayload } from "@lesefluss/book-import";
import type { BookStatus } from "@lesefluss/core";

export type { BookPayload, Chapter, RawInput } from "@lesefluss/book-import";

/** Caller-supplied metadata merged into the final `Book` row by `commitBook`. */
export type ImportExtras = {
	source?: string | null;
	catalogId?: string | null;
	sourceUrl?: string | null;
	/** BCP 47 tag from the originating service, verbatim. */
	language?: string | null;
};

/** Reader's corrections from the confirm sheet. */
export type ImportOverrides = {
	title: string;
	author: string | null;
	description: string | null;
	language: string | null;
	status: BookStatus | null;
	rating: number | null;
	review: string | null;
	tags: string | null;
};

/**
 * A parsed book that has not been written yet.
 *
 * Holds the full text and, for formats worth keeping, the original file bytes,
 * so it must not outlive the confirm step: whoever stages one is responsible for
 * dropping it on commit or cancel.
 */
export type StagedImport = {
	payload: BookPayload;
	extras: ImportExtras;
	/**
	 * Released when the entry leaves the queue, committed or discarded. A share
	 * arrives as a copy in the OS cache directory, and deleting that copy when
	 * the PARSE finished would strand the reader: the app can be killed while the
	 * confirm sheet is open, and then neither the book nor the shared file exists.
	 */
	cleanup?: () => void;
};
