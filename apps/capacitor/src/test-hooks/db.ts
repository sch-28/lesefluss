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

export type E2EInvalidate = (queryKey: readonly unknown[]) => Promise<void>;

/** Lets a test refetch queries the way a sync pull or a chapter fetch does. */
export function exposeQueryInvalidate(invalidate: E2EInvalidate): void {
	(window as unknown as { __lesefluss_e2e_invalidate?: E2EInvalidate }).__lesefluss_e2e_invalidate =
		invalidate;
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
