export type { BookPayload, Chapter, RawInput } from "@lesefluss/book-import";

/** Caller-supplied metadata merged into the final `Book` row by `commitBook`. */
export type ImportExtras = {
	source?: string | null;
	catalogId?: string | null;
	sourceUrl?: string | null;
};
