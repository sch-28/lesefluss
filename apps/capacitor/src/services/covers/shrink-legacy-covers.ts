import { Preferences } from "@capacitor/preferences";
import {
	COVER_BUDGET_BYTES,
	normalizeCoverDataUrl,
} from "@lesefluss/book-import/utils/cover-image";
import { log } from "../../utils/log";
import { activeDriver } from "../db";
import type { DbDriverKind } from "../db/driver";
import { bookKeys, serialKeys } from "../db/hooks/query-keys";
import { queries } from "../db/queries";
import type { StoredCover } from "../db/queries/covers";
import { queryClient } from "../query-client";

/** Base64 length of a cover at the byte budget, plus room for the data URL prefix. */
export const COVER_BUDGET_CHARS = Math.ceil(COVER_BUDGET_BYTES / 3) * 4 + 64;

const STATE_KEY = "coverShrink.state";
// Leaves the main thread to the library and the reader between two covers.
const PAUSE_MS = 250;
// Lets the library finish its first render before any cover is decoded.
const START_DELAY_MS = 5000;

export function isOverCoverBudget(cover: string | null | undefined): cover is string {
	return !!cover && cover.length > COVER_BUDGET_CHARS;
}

/** A cover arriving from the server, shrunk to the budget before it is stored. */
export async function normalizeIncomingCover(
	cover: string | null | undefined,
): Promise<string | null> {
	if (!isOverCoverBudget(cover)) return cover ?? null;
	try {
		return await normalizeCoverDataUrl(cover);
	} catch (err) {
		log.warn("db", "incoming cover kept as it is:", err);
		return cover;
	}
}

export type CoverShrinkCounts = { shrunk: number; kept: number };

export type CoverShrinkDeps = {
	storageKind: () => DbDriverKind | null;
	isDone: () => Promise<boolean>;
	markDone: () => Promise<void>;
	candidates: () => Promise<StoredCover[]>;
	read: (cover: StoredCover) => Promise<string | null>;
	replace: (cover: StoredCover, from: string, to: string) => Promise<void>;
	shrink: (cover: string) => Promise<string | null>;
	pause: () => Promise<void>;
};

/**
 * Shrinks covers stored before import-time normalization, once per device.
 * Each cover is written on its own, so a run cut short leaves the rest over
 * the budget and the next start finds them again; the device is marked done
 * only after the last one. Skipped on the legacy web store, where every write
 * rewrites the whole database.
 */
export async function runCoverShrink(deps: CoverShrinkDeps): Promise<CoverShrinkCounts | null> {
	const kind = deps.storageKind();
	if (kind !== "native" && kind !== "opfs") return null;
	if (await deps.isDone()) return null;
	const counts: CoverShrinkCounts = { shrunk: 0, kept: 0 };
	for (const target of await deps.candidates()) {
		await deps.pause();
		const cover = await deps.read(target);
		if (!isOverCoverBudget(cover)) continue;
		let smaller: string | null = null;
		try {
			smaller = await deps.shrink(cover);
		} catch (err) {
			log.warn("db", `cover of ${target.table} ${target.id} kept as it is:`, err);
		}
		if (smaller && smaller.length < cover.length) {
			await deps.replace(target, cover, smaller);
			counts.shrunk++;
		} else {
			counts.kept++;
		}
	}
	await deps.markDone();
	return counts;
}

const appDeps: CoverShrinkDeps = {
	storageKind: () => activeDriver()?.kind ?? null,
	isDone: async () => (await Preferences.get({ key: STATE_KEY })).value === "done",
	markDone: () => Preferences.set({ key: STATE_KEY, value: "done" }),
	candidates: () => queries.getOversizedCovers(COVER_BUDGET_CHARS),
	read: queries.getStoredCover,
	replace: queries.replaceStoredCover,
	shrink: normalizeCoverDataUrl,
	pause: () => new Promise((resolve) => setTimeout(resolve, PAUSE_MS)),
};

let started = false;

/** Call once the database is ready; the pass starts after the first render. */
export function startCoverShrink(deps: CoverShrinkDeps = appDeps): void {
	if (started) return;
	started = true;
	setTimeout(() => void runAndRefresh(deps), START_DELAY_MS);
}

async function runAndRefresh(deps: CoverShrinkDeps): Promise<void> {
	try {
		const counts = await runCoverShrink(deps);
		if (!counts) return;
		log("db", `cover shrink: ${counts.shrunk} shrunk, ${counts.kept} kept`);
		if (counts.shrunk === 0) return;
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: bookKeys.all }),
			queryClient.invalidateQueries({ queryKey: serialKeys.all }),
		]);
	} catch (err) {
		log.warn("db", "cover shrink stopped, it resumes on the next start:", err);
	}
}
