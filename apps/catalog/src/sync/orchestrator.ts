import { captureException } from "../lib/error-tracking.js";
import { dedupSE } from "./dedup.js";
import { syncGutenberg } from "./gutenberg.js";
import { syncStandardEbooks } from "./standard-ebooks.js";

export type Source = "gutenberg" | "standard_ebooks" | "all";
export type ActiveSource = "gutenberg" | "standard_ebooks" | "dedup";

type State = {
	running: boolean;
	currentSource: ActiveSource | null;
	phase: string | null;
	booksUpserted: number;
	booksSuppressed: number;
	lastStartedAt: Date | null;
	lastFinishedAt: Date | null;
	lastError: string | null;
};

const state: State = {
	running: false,
	currentSource: null,
	phase: null,
	booksUpserted: 0,
	booksSuppressed: 0,
	lastStartedAt: null,
	lastFinishedAt: null,
	lastError: null,
};

export function getSyncState(): Readonly<State> {
	return state;
}

export function setSyncPhase(source: ActiveSource, phase: string): void {
	state.currentSource = source;
	state.phase = phase;
}

export function addBooksUpserted(n: number): void {
	state.booksUpserted += n;
}

export function addBooksSuppressed(n: number): void {
	state.booksSuppressed += n;
}

export async function runSync(source: Source = "all"): Promise<void> {
	if (state.running) {
		console.log("[sync] already running, ignoring trigger");
		return;
	}
	state.running = true;
	state.lastStartedAt = new Date();
	state.lastError = null;
	state.booksUpserted = 0;
	state.booksSuppressed = 0;
	state.currentSource = null;
	state.phase = null;

	try {
		if (source === "gutenberg" || source === "all") await syncGutenberg();
		if (source === "standard_ebooks" || source === "all") {
			const { skipped } = await syncStandardEbooks();
			if (!skipped) await dedupSE();
		}
	} catch (err) {
		state.lastError = err instanceof Error ? err.message : String(err);
		captureException(err, {
			tags: {
				kind: "sync",
				source,
				currentSource: state.currentSource ?? "none",
			},
			extra: {
				phase: state.phase,
				booksUpserted: state.booksUpserted,
				booksSuppressed: state.booksSuppressed,
			},
		});
		console.error("[sync] failed:", err);
	} finally {
		state.running = false;
		state.currentSource = null;
		state.phase = null;
		state.lastFinishedAt = new Date();
	}
}
