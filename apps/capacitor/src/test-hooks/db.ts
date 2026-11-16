import type { DbDriverKind, DbRow } from "../services/db/driver";

/**
 * Dev-only window hooks over the local database for Playwright e2e tests. The
 * callsite is wrapped in `if (import.meta.env.DEV)`, so this tree-shakes out of
 * release bundles, like test-hooks/reader.ts.
 */

export type E2EBookRow = { wordPosition: number; updatedAt: number; lastRead: number | null };

export type E2EReadBookRow = (bookId: string) => Promise<E2EBookRow | null>;

/** Lets a test read what a book's row holds (its position and revision), independent of any save hook. */
export function exposeBookRowRead(read: E2EReadBookRow): void {
	(
		window as unknown as { __lesefluss_e2e_readBookRow?: E2EReadBookRow }
	).__lesefluss_e2e_readBookRow = read;
}

export type E2ERemotePosition = (
	bookId: string,
	word: number,
	updatedAt: number,
	options?: {
		/** Off: the reader only finds the row through its own next write. */
		invalidate?: boolean;
		/** Reads the row first and applies after the reader's next save, as a slow pull does. */
		applyAfterNextSave?: boolean;
	},
) => Promise<void>;

/** Lets a test land a position from another device the way a sync pull does. */
export function exposeRemotePosition(apply: E2ERemotePosition): void {
	(
		window as unknown as { __lesefluss_e2e_remotePosition?: E2ERemotePosition }
	).__lesefluss_e2e_remotePosition = apply;
}

export type E2EBookSession = { mode: string; durationMs: number; wordsRead: number };

export type E2EReadBookSessions = (bookId: string) => Promise<E2EBookSession[]>;

/** Lets a test check that a sitting reached stats. */
export function exposeBookSessionsRead(read: E2EReadBookSessions): void {
	(
		window as unknown as { __lesefluss_e2e_readBookSessions?: E2EReadBookSessions }
	).__lesefluss_e2e_readBookSessions = read;
}

export type E2EDbProbe = {
	kind: () => DbDriverKind | null;
	execute: (sql: string) => Promise<void>;
	query: (sql: string) => Promise<DbRow[]>;
	/** One reader position write through the reader's own path; resolves to its duration in ms. */
	timePositionSave: (bookId: string, word: number) => Promise<number>;
};

/** Raw access to the active driver, for seeding a large library and timing saves on it. */
export function exposeDbProbe(probe: E2EDbProbe): void {
	(window as unknown as { __lesefluss_e2e_db?: E2EDbProbe }).__lesefluss_e2e_db = probe;
}
