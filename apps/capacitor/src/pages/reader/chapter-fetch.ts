import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { bookKeys, serialKeys } from "../../services/db/hooks/query-keys";
import type { Book } from "../../services/db/schema";
import { fetchAndStoreChapter } from "../../services/serial-scrapers";
import { log } from "../../utils/log";

/**
 * Reader-side state machine for a chapter row.
 *
 * - `ready` — standalone book OR a `fetched` chapter; render normally.
 * - `loading` — chapter is `pending` and we're either about to fetch or in flight.
 * - `locked` — provider returned a paywall page (e.g. Wuxiaworld karma).
 * - `error` — fetch failed (network or parse). `retry` re-fires the mutation.
 */
export type ChapterFetchState =
	| { kind: "ready" }
	| { kind: "loading" }
	| { kind: "locked" }
	| { kind: "error"; reason: string; retry: () => void };

/**
 * Drives a chapter from `pending` to `fetched` when the reader opens it. Sole
 * caller of `fetchAndStoreChapter` from the reader side.
 *
 * Effect: when the rendered book is a `pending` chapter, kick off a fetch —
 * once per book id. A ref-guarded set tracks in-flight ids so React 18's
 * StrictMode double-effect doesn't fire two parallel mutations (which would
 * race and double-write content).
 *
 * Mutation invalidates both the book detail and the book content queries on
 * settle so the reader re-renders with real text.
 *
 * For non-chapter books (`book.seriesId === null`), returns `ready`
 * unconditionally — the existing book flow is unaffected.
 */
export function useChapterFetch(book: Book | undefined): ChapterFetchState {
	const qc = useQueryClient();
	const inflightRef = useRef<Set<string>>(new Set());

	// Mutation variables carry `seriesId` explicitly so that `onSettled` is not
	// subject to stale-closure risk: if the user navigates to a chapter in a
	// different series before this fetch completes, we still invalidate the
	// correct `serialKeys.chapters` entry (the one that was in flight, not the
	// one currently rendered).
	const mutation = useMutation({
		mutationFn: ({ id }: { id: string; seriesId: string | null }) =>
			fetchAndStoreChapter(id),
		onSettled: (_data, err, { id, seriesId }) => {
			inflightRef.current.delete(id);
			if (err) log.warn("reader", `chapter ${id} fetch failed:`, err);
			qc.invalidateQueries({ queryKey: bookKeys.detail(id) });
			qc.invalidateQueries({ queryKey: bookKeys.content(id) });
			if (seriesId) {
				qc.invalidateQueries({ queryKey: serialKeys.chapters(seriesId) });
			}
		},
	});

	const trigger = useCallback(
		(id: string) => {
			if (inflightRef.current.has(id)) return;
			inflightRef.current.add(id);
			mutation.mutate({ id, seriesId: book?.seriesId ?? null });
		},
		[mutation, book?.seriesId],
	);

	const retry = useCallback(() => {
		if (book?.id) trigger(book.id);
	}, [book?.id, trigger]);

	useEffect(() => {
		if (!book?.seriesId) return;
		if (book.chapterStatus !== "pending") return;
		trigger(book.id);
	}, [book?.id, book?.seriesId, book?.chapterStatus, trigger]);

	return useMemo<ChapterFetchState>(() => {
		if (!book?.seriesId) return { kind: "ready" };
		if (book.chapterStatus === "fetched") return { kind: "ready" };
		if (book.chapterStatus === "locked") return { kind: "locked" };
		if (book.chapterStatus === "error" || mutation.isError) {
			const reason = mutation.error instanceof Error ? mutation.error.message : "Unknown error";
			return { kind: "error", reason, retry };
		}
		return { kind: "loading" };
	}, [book?.seriesId, book?.chapterStatus, mutation.isError, mutation.error, retry]);
}
