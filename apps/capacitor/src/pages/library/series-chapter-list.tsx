/**
 * SeriesChapterList — virtualized chapter roster rendered inside SeriesDetail's
 * DetailShell `children` slot.
 *
 * Responsibilities:
 *   - Fetch ordered chapter rows for a series via `useSeriesChapters`.
 *   - Render every chapter as a tappable row that routes to `/tabs/reader/:id`.
 *   - Surface per-chapter state: unread / in-progress (with %) / finished /
 *     pending-fetch / locked / error — using the same icon vocabulary as
 *     `<ChapterStateOverlay>` in the reader.
 *
 * Virtualization: always uses `<VList>` from `virtua` (same dep as the scroll
 * reader). This keeps the code path uniform and avoids a threshold branch that
 * would need its own tests. The list is height-constrained (`30vh`) so it
 * scrolls independently within the page.
 *
 * This component is intentionally presentational — no mutations, no polling.
 * Polling is TASK-37.5. Cache invalidation after a lazy chapter fetch is wired
 * in `pages/reader/chapter-fetch.ts`.
 */

import { IonIcon, IonSpinner } from "@ionic/react";
import {
	alertCircleOutline,
	checkmarkCircleOutline,
	cloudDownloadOutline,
	ellipseOutline,
	lockClosedOutline,
} from "ionicons/icons";
import type React from "react";
import { memo, useCallback } from "react";
import { useHistory } from "react-router-dom";
import { VList } from "virtua";
import { queryHooks } from "../../services/db/hooks";
import type { Book } from "../../services/db/schema";
import { readingProgress } from "./sort-filter";

// ── Read-state helpers ────────────────────────────────────────────────────────

/**
 * 32-byte tail tolerance: positions within the last 32 bytes of a book are
 * treated as "finished". This matches the rest of the app (sort-filter.ts:24).
 */
const FINISHED_TAIL = 32;

type RowState =
	| { kind: "unread" }
	| { kind: "in-progress"; pct: number }
	| { kind: "finished" }
	| { kind: "pending" }
	| { kind: "locked" }
	| { kind: "error" };

function chapterRowState(book: Book): RowState {
	if (book.chapterStatus === "pending") return { kind: "pending" };
	if (book.chapterStatus === "locked") return { kind: "locked" };
	if (book.chapterStatus === "error") return { kind: "error" };

	// chapterStatus === 'fetched'
	if (book.lastRead == null) return { kind: "unread" };
	if (book.size > 0 && book.position >= book.size - FINISHED_TAIL)
		return { kind: "finished" };

	return { kind: "in-progress", pct: readingProgress(book) };
}

// ── ChapterRow ────────────────────────────────────────────────────────────────

type ChapterRowProps = {
	book: Book;
	onTap: (bookId: string) => void;
};

const ROW_BASE_CLASS =
	"chapter-row flex w-full items-center gap-3 px-4 py-2.5 text-left transition-opacity active:opacity-60";

/**
 * `memo` is load-bearing here: when one chapter's status changes (e.g. lazy
 * fetch resolves), React Query swaps in a new array reference but the
 * untouched chapter rows have the same `book` reference, so memo skips them.
 * Requires `onTap` to be a stable reference — provided by the parent's
 * `useCallback`.
 */
const ChapterRow = memo<ChapterRowProps>(({ book, onTap }) => {
	const state = chapterRowState(book);

	// Index is 0-based in DB; display as 1-based like the reader does.
	const displayIndex = (book.chapterIndex ?? 0) + 1;
	const isCurrent = state.kind === "in-progress";

	return (
		<button
			type="button"
			onClick={() => onTap(book.id)}
			className={isCurrent ? `${ROW_BASE_CLASS} is-current` : ROW_BASE_CLASS}
		>
			{/* Chapter number — fixed width so titles align regardless of digits */}
			<span className="w-8 shrink-0 text-right text-sm opacity-40">
				{displayIndex}
			</span>

			{/* Title — fills remaining space, truncated to single line */}
			<span className="min-w-0 flex-1 truncate text-sm">{book.title}</span>

			{/* Progress % for in-progress chapters (only) */}
			{state.kind === "in-progress" && (
				<span className="shrink-0 text-xs opacity-50">{state.pct}%</span>
			)}

			{/* Status glyph */}
			<StateGlyph state={state} />
		</button>
	);
});
ChapterRow.displayName = "ChapterRow";

// ── StateGlyph ────────────────────────────────────────────────────────────────

const GLYPH_CLASS = "shrink-0 text-base";

const StateGlyph: React.FC<{ state: RowState }> = ({ state }) => {
	switch (state.kind) {
		case "unread":
			// No glyph — clean row, uncluttered.
			return null;

		case "in-progress":
			return (
				<IonIcon
					icon={ellipseOutline}
					className={`${GLYPH_CLASS} opacity-50`}
					aria-label="In progress"
				/>
			);

		case "finished":
			return (
				<IonIcon
					icon={checkmarkCircleOutline}
					className={`${GLYPH_CLASS} text-green-500 opacity-70`}
					aria-label="Finished"
				/>
			);

		case "pending":
			return (
				<IonIcon
					icon={cloudDownloadOutline}
					className={`${GLYPH_CLASS} opacity-50`}
					aria-label="Pending download"
				/>
			);

		case "locked":
			return (
				<IonIcon
					icon={lockClosedOutline}
					className={`${GLYPH_CLASS} opacity-50`}
					aria-label="Locked"
				/>
			);

		case "error":
			return (
				<IonIcon
					icon={alertCircleOutline}
					className={`${GLYPH_CLASS} text-red-500 opacity-70`}
					aria-label="Error"
				/>
			);
	}
};

// ── Loading header ────────────────────────────────────────────────────────────

/**
 * Lightweight loading state: keeps just the section title and adds a small
 * inline spinner. Avoids the layout shift that placeholder rows caused when
 * real chapters streamed in.
 */
const ChapterListLoading: React.FC = () => (
	<div className="chapter-list-section">
		<p className="chapter-list-title flex items-center gap-2">
			<span>Chapters</span>
			<IonSpinner name="crescent" className="h-3.5 w-3.5" />
		</p>
	</div>
);

// ── SeriesChapterList ─────────────────────────────────────────────────────────

type Props = { seriesId: string; isSyncing?: boolean };

/**
 * Rendered as the `children` slot of `<DetailShell>` in `SeriesDetail`.
 * Queries are enabled only when `seriesId` is present — guaranteed by caller.
 *
 * `isSyncing` toggles a small spinner next to the "Chapters" label while a
 * background chapter-list refresh is running. Inline rather than a separate
 * status `<p>` so the row layout doesn't shift when sync starts/stops.
 */
export const SeriesChapterList: React.FC<Props> = ({ seriesId, isSyncing }) => {
	const history = useHistory();
	const { data: chapters, isPending } = queryHooks.useSeriesChapters(seriesId);

	// Stable reference — new function on every render would cause every visible
	// ChapterRow to re-render when the RQ cache updates any chapter's status.
	const handleTap = useCallback(
		(bookId: string) => {
			history.push(`/tabs/reader/${bookId}`);
		},
		[history],
	);

	if (isPending) return <ChapterListLoading />;
	if (!chapters || chapters.length === 0) return null;

	// Approximate row pitch: py-2.5 (20px) + ~20px text + 2px transparent
	// border + 6px margin-bottom = ~48px. Used only to cap listHeight at 30vh
	// (VList measures real heights itself), so over/undershoot of a few px
	// just shifts the cap by one row.
	const ROW_HEIGHT_PX = 48;
	const listHeight = Math.min(
		chapters.length * ROW_HEIGHT_PX,
		window.innerHeight * 0.3,
	);

	return (
		<div className="chapter-list-section">
			{/* Section header */}
			<p className="chapter-list-title flex items-center gap-2">
				<span>Chapters</span>
				{isSyncing && <IonSpinner name="crescent" className="h-3.5 w-3.5" />}
			</p>

			{/*
			 * VList always fills its explicit height (overflow: auto). We calculate
			 * the height dynamically so short series collapse to fit their content
			 * rather than leaving up to 30 vh of blank space.
			 */}
			<VList style={{ height: listHeight }}>
				{chapters.map((chapter) => (
					<ChapterRow key={chapter.id} book={chapter} onTap={handleTap} />
				))}
			</VList>
		</div>
	);
};
