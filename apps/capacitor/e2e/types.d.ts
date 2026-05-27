/**
 * Ambient declarations for the dev-only window hooks the reader publishes via
 * `src/test-hooks/reader.ts` when `import.meta.env.DEV` is true. Lets spec code
 * read `window.__lesefluss_e2e_*` without per-callsite `as unknown as` casts.
 */
declare global {
	interface Window {
		__lesefluss_e2e_progress_word?: number;
		__lesefluss_e2e_save?: {
			bookId: string;
			word: number;
			at: number;
			count: number;
		};
		__lesefluss_e2e_session?: {
			count: number;
			lastKind: "checkpoint" | "flush";
			bookId: string;
		};
	}
}

export {};
