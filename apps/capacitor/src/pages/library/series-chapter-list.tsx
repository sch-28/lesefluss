/**
 * SeriesChapterList. Virtualized chapter roster rendered inside SeriesDetail's
 * DetailShell `children` slot.
 *
 * Per-chapter state: unread / in-progress (with %) / finished / pending-fetch /
 * locked / error. Same icon vocabulary as <ChapterStateOverlay> in the reader.
 *
 * Virtualization via `virtua`'s `<VList>` (same dep as scroll reader).
 * Height-constrained (max 30vh) so the list scrolls independently within the
 * page.
 */

import { cn } from "@lesefluss/ui/utils";
import { useRouter } from "@tanstack/react-router";
import { AlertCircle, CheckCircle2, Circle, CloudDownload, Loader2, Lock } from "lucide-react";
import type React from "react";
import { memo, useCallback } from "react";
import { VList } from "virtua";
import { queryHooks } from "../../services/db/hooks";
import type { Book } from "../../services/db/schema";
import { isBookFinished, readingProgress } from "./sort-filter";

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
	if (isBookFinished(book)) return { kind: "finished" };

	return { kind: "in-progress", pct: readingProgress(book) };
}

type ChapterRowProps = {
	book: Book;
	onTap: (bookId: string) => void;
};

/**
 * `memo` is load-bearing: when one chapter's status changes (e.g. lazy fetch
 * resolves), React Query swaps in a new array reference but untouched chapter
 * rows have the same `book` reference, so memo skips them. Requires `onTap` to
 * be a stable reference (provided by parent `useCallback`).
 */
const ChapterRow = memo<ChapterRowProps>(({ book, onTap }) => {
	const state = chapterRowState(book);

	// Index is 0-based in DB; display 1-based to match reader.
	const displayIndex = (book.chapterIndex ?? 0) + 1;
	const isCurrent = state.kind === "in-progress";

	return (
		<button
			type="button"
			onClick={() => onTap(book.id)}
			className={cn(
				"flex w-full items-center gap-3 border-0 bg-transparent px-4 py-2.5 text-left text-foreground transition-opacity active:opacity-60",
				isCurrent && "bg-primary/5",
			)}
		>
			{/* Chapter number, fixed width so titles align regardless of digit count */}
			<span className="w-8 shrink-0 text-right text-muted-foreground text-sm">{displayIndex}</span>

			{/* Title, fills remaining space, single-line truncation */}
			<span className="min-w-0 flex-1 truncate text-sm">{book.title}</span>

			{/* Progress % for in-progress chapters */}
			{state.kind === "in-progress" && (
				<span className="shrink-0 text-muted-foreground text-xs">{state.pct}%</span>
			)}

			<StateGlyph state={state} />
		</button>
	);
});
ChapterRow.displayName = "ChapterRow";

const StateGlyph: React.FC<{ state: RowState }> = ({ state }) => {
	switch (state.kind) {
		case "unread":
			return null;
		case "in-progress":
			return <Circle className="size-4 shrink-0 text-muted-foreground" aria-label="In progress" />;
		case "finished":
			return <CheckCircle2 className="size-4 shrink-0 text-emerald-500" aria-label="Finished" />;
		case "pending":
			return (
				<CloudDownload
					className="size-4 shrink-0 text-muted-foreground"
					aria-label="Pending download"
				/>
			);
		case "locked":
			return <Lock className="size-4 shrink-0 text-muted-foreground" aria-label="Locked" />;
		case "error":
			return <AlertCircle className="size-4 shrink-0 text-destructive" aria-label="Error" />;
	}
};

const ChapterListLoading: React.FC = () => (
	<div className="mt-6 px-4">
		<p className="m-0 flex items-center gap-2 font-semibold text-base">
			<span>Chapters</span>
			<Loader2 className="size-3.5 animate-spin text-muted-foreground" />
		</p>
	</div>
);

type Props = { seriesId: string; isSyncing?: boolean };

/**
 * Queries enabled only when `seriesId` is present (guaranteed by caller).
 * `isSyncing` toggles an inline spinner next to "Chapters" while a background
 * chapter-list refresh runs. Inline rather than separate so row layout doesn't
 * shift when sync starts/stops.
 */
export const SeriesChapterList: React.FC<Props> = ({ seriesId, isSyncing }) => {
	const router = useRouter();
	const { data: chapters, isPending } = queryHooks.useSeriesChapters(seriesId);

	// Stable reference. New function every render would invalidate every
	// visible ChapterRow's memo when RQ cache updates any single chapter.
	const handleTap = useCallback(
		(bookId: string) => {
			router.navigate({ to: "/tabs/reader/$id", params: { id: bookId } });
		},
		[router],
	);

	if (isPending) return <ChapterListLoading />;
	if (!chapters || chapters.length === 0) return null;

	// Approximate row pitch: py-2.5 (20px) + ~20px text + 8px chrome = ~48px.
	// Used only to cap listHeight at 30vh (VList measures real heights).
	const ROW_HEIGHT_PX = 48;
	const listHeight = Math.min(chapters.length * ROW_HEIGHT_PX, window.innerHeight * 0.3);

	return (
		<div className="mt-6">
			<p className="m-0 mb-2 flex items-center gap-2 px-4 font-semibold text-base">
				<span>Chapters</span>
				{isSyncing && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
			</p>

			{/* VList fills its explicit height (overflow: auto). Height calculated
			 * so short series collapse to fit rather than leaving 30vh of blank. */}
			<VList style={{ height: listHeight }}>
				{chapters.map((chapter) => (
					<ChapterRow key={chapter.id} book={chapter} onTap={handleTap} />
				))}
			</VList>
		</div>
	);
};
