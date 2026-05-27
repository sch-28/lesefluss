/**
 * Dev-only window hooks the reader writes for Playwright e2e tests. Bodies are
 * unguarded; callsites wrap each call in `if (import.meta.env.DEV)` so esbuild
 * const-folds the call away in production. With no remaining references, this
 * whole module tree-shakes out of release bundles.
 *
 * Tests read these via `page.evaluate(() => window.__lesefluss_e2e_...)`.
 */

export type E2ESaveHook = {
	bookId: string;
	word: number;
	at: number;
	count: number;
};

export type E2ESessionHook = {
	count: number;
	lastKind: "checkpoint" | "flush";
	bookId: string;
};

type E2EWindow = {
	__lesefluss_e2e_progress_word?: number;
	__lesefluss_e2e_save?: E2ESaveHook;
	__lesefluss_e2e_session?: E2ESessionHook;
};

function w(): E2EWindow {
	return window as unknown as E2EWindow;
}

export function publishProgressWord(word: number): void {
	w().__lesefluss_e2e_progress_word = word;
}

export function publishPositionSave(bookId: string, word: number): void {
	const e = w();
	e.__lesefluss_e2e_save = {
		bookId,
		word,
		at: Date.now(),
		count: (e.__lesefluss_e2e_save?.count ?? 0) + 1,
	};
}

export function publishSessionPersist(bookId: string, kind: "checkpoint" | "flush"): void {
	const e = w();
	e.__lesefluss_e2e_session = {
		bookId,
		lastKind: kind,
		count: (e.__lesefluss_e2e_session?.count ?? 0) + 1,
	};
}
