import type { SyncSettings } from "@lesefluss/core";
import type { E2EBookRow, E2EInvalidate, E2ERemotePosition } from "../src/test-hooks/db";
import type { E2ESaveEntry } from "../src/test-hooks/reader";
import type { E2ETtsDriver } from "../src/test-hooks/tts";

/**
 * Ambient declarations for the dev-only window hooks the app publishes via
 * `src/test-hooks/` when `import.meta.env.DEV` is true. Lets spec code
 * read `window.__lesefluss_e2e_*` without per-callsite `as unknown as` casts.
 */
declare global {
	interface Window {
		__lesefluss_e2e_progress_word?: number;
		__lesefluss_e2e_save?: E2ESaveEntry & { count: number };
		/** Every save since the page loaded, in order. */
		__lesefluss_e2e_saveLog?: E2ESaveEntry[];
		/** Position writes decided, counted before their async DB write. */
		__lesefluss_e2e_saveRequests?: number;
		__lesefluss_e2e_saveFinished?: number;
		/** Settles the scroll view reported, saved or not. */
		__lesefluss_e2e_settles?: number;
		__lesefluss_e2e_syncPushRequests?: number;
		__lesefluss_e2e_devicePosition?: (word: number) => Promise<void>;
		__lesefluss_e2e_invalidate?: E2EInvalidate;
		__lesefluss_e2e_remotePosition?: E2ERemotePosition;
		__lesefluss_e2e_fakeTts?: boolean;
		__lesefluss_e2e_tts?: E2ETtsDriver;
		__lesefluss_e2e_settleLog?: { word: number; at: number }[];
		__lesefluss_e2e_lastJumpAt?: number;
		/** The scroll reader's anchor hold phase. */
		__lesefluss_e2e_hold?: "idle" | "settling" | "holding";
		/** The word a book's row holds, read from the database. */
		__lesefluss_e2e_readBookRow?: (bookId: string) => Promise<E2EBookRow | null>;
		__lesefluss_e2e_session?: {
			count: number;
			lastKind: "checkpoint" | "flush";
			bookId: string;
		};
		__lesefluss_e2e_session_ticks?: number;
		/** Applies settings the way a sync pull adopts them; see test-hooks/sync.ts. */
		__lesefluss_e2e_applyRemoteSettings?: (patch: Partial<SyncSettings>) => Promise<void>;
		__lesefluss_e2e_link_open?: {
			href: string;
			at: number;
			count: number;
		};
	}
}
