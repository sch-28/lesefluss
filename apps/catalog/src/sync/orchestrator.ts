import { dedupSE } from "./dedup.js";
import { syncGutenberg } from "./gutenberg.js";
import { syncStandardEbooks } from "./standard-ebooks.js";

export type Source = "gutenberg" | "standard_ebooks" | "all";

type State = {
	running: boolean;
	lastStartedAt: Date | null;
	lastFinishedAt: Date | null;
	lastError: string | null;
};

const state: State = {
	running: false,
	lastStartedAt: null,
	lastFinishedAt: null,
	lastError: null,
};

export function getSyncState(): Readonly<State> {
	return state;
}

export async function runSync(source: Source = "all"): Promise<void> {
	if (state.running) {
		console.log("[sync] already running, ignoring trigger");
		return;
	}
	state.running = true;
	state.lastStartedAt = new Date();
	state.lastError = null;

	try {
		if (source === "gutenberg" || source === "all") await syncGutenberg();
		if (source === "standard_ebooks" || source === "all") {
			const { skipped } = await syncStandardEbooks();
			if (!skipped) await dedupSE();
		}
	} catch (err) {
		state.lastError = err instanceof Error ? err.message : String(err);
		console.error("[sync] failed:", err);
	} finally {
		state.running = false;
		state.lastFinishedAt = new Date();
	}
}
