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
		mutationFn: ({ id }: { id: string; seriesId: string | null }) => fetchAndStoreChapter(id),
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
		// A retry on an `error` chapter fires the mutation but the row stays
		// `chapterStatus = "error"` until commit. Without this guard the user
		// sees the error overlay sit unchanged for the duration of the retry,
		// then suddenly snap to ready. Showing the skeleton while the retry is
		// in flight matches the initial-fetch experience.
		if (mutation.isPending) return { kind: "loading" };
		// Mutation settled with a terminal result but the DB query hasn't
		// refetched yet (book.chapterStatus is still "pending"). Surface the
		// outcome immediately so the skeleton doesn't persist until the
		// round-trip through SQLite completes.
		if (mutation.data?.status === "error") {
			return { kind: "error", reason: mutation.data.reason, retry };
		}
		if (mutation.data?.status === "locked") return { kind: "locked" };
		if (book.chapterStatus === "error" || mutation.isError) {
			// Prefer the persisted reason (set by `commitChapter` from the
			// adapter's ChapterFetchResult) over the mutation's runtime error.
			// `mutation.error` is null when the chapter row was committed in a
			// prior session, so without the persisted column we'd fall through
			// to "Unknown error".
			const reason =
				book.chapterError ??
				(mutation.error instanceof Error ? mutation.error.message : "Unknown error");
			return { kind: "error", reason, retry };
		}
		return { kind: "loading" };
	}, [
		book?.seriesId,
		book?.chapterStatus,
		book?.chapterError,
		mutation.isPending,
		mutation.data,
		mutation.isError,
		mutation.error,
		retry,
	]);
}
