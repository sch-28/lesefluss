import { useSyncExternalStore } from "react";
import { onSessionsDeleted } from "./deleted";
import { MIN_DURATION_MS, type SessionRow } from "./rules";

/** The summary follows any real sitting: the same bar a sitting needs to be written at all. */
export const SUMMARY_MIN_ACTIVE_MS = MIN_DURATION_MS;

const summaryMinMinutes = SUMMARY_MIN_ACTIVE_MS / 60_000;
export const SUMMARY_SETTING_HINT = `A sheet with the sitting's time, words and speed when you close a book after ${summaryMinMinutes === 1 ? "a minute" : `${summaryMinMinutes} minutes`} or more.`;

/** The router re-mounts the reader once while leaving it; a close re-opened this fast never happened. */
export const CLOSE_SETTLE_MS = 400;

/** The sittings of one reader visit to one book, every mode in it. */
export type SessionSummary = { bookId: string; sittings: SessionRow[] };

type Visit = {
	bookId: string | null;
	sittings: Map<string, SessionRow>;
	closeTimer: ReturnType<typeof setTimeout> | null;
};

let visit: Visit | null = null;
let pending: SessionSummary | null = null;
const listeners = new Set<() => void>();

function emit(): void {
	for (const listener of listeners) listener();
}

function publish(v: Visit): void {
	if (v.closeTimer) clearTimeout(v.closeTimer);
	if (visit === v) visit = null;
	const sittings = [...v.sittings.values()].sort((a, b) => a.startedAt - b.startedAt);
	const activeMs = sittings.reduce((sum, s) => sum + s.durationMs, 0);
	if (v.bookId === null || activeMs < SUMMARY_MIN_ACTIVE_MS) return;
	pending = { bookId: v.bookId, sittings };
	emit();
}

export function openVisit(): void {
	if (visit?.closeTimer) {
		clearTimeout(visit.closeTimer);
		visit.closeTimer = null;
		return;
	}
	visit ??= { bookId: null, sittings: new Map(), closeTimer: null };
}

export function closeVisit(): void {
	const v = visit;
	if (!v || v.closeTimer) return;
	v.closeTimer = setTimeout(() => publish(v), CLOSE_SETTLE_MS);
}

/** A sitting on another book starts the visit over: a summary is about one book. */
export function recordSitting(row: SessionRow): void {
	if (!visit) return;
	if (visit.bookId !== row.bookId) {
		visit.bookId = row.bookId;
		visit.sittings = new Map();
	}
	visit.sittings.set(row.id, row);
}

export function dismissSummary(): void {
	if (!pending) return;
	pending = null;
	emit();
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function useSessionSummary(): SessionSummary | null {
	return useSyncExternalStore(subscribe, () => pending);
}

onSessionsDeleted((ids) => {
	for (const id of ids) visit?.sittings.delete(id);
	if (!pending) return;
	const sittings = pending.sittings.filter((s) => !ids.has(s.id));
	if (sittings.length === pending.sittings.length) return;
	pending = sittings.length > 0 ? { ...pending, sittings } : null;
	emit();
});

/** Test-only: forget every visit and summary. */
export function resetSummaryStore(): void {
	if (visit?.closeTimer) clearTimeout(visit.closeTimer);
	visit = null;
	pending = null;
}
