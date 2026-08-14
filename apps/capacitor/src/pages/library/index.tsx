import { readingProgress } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { Input } from "@lesefluss/ui/input";
import { Progress } from "@lesefluss/ui/progress";
import { useIsMutating, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import {
	ArrowUpDown,
	BarChart3,
	BookOpen,
	BookText,
	Filter as FilterIcon,
	Loader2,
	Pencil,
	Plus,
	RefreshCcw,
	Search,
	X,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActionSheet } from "../../components/action-sheet";
import { TabHeader } from "../../components/app-shell/tab-header";
import BLEIndicator from "../../components/ble-indicator";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { type ViewMode, ViewModeToggle } from "../../components/view-mode-toggle";
import { useBLE } from "../../contexts/ble-context";
import { useBookSync } from "../../contexts/book-sync-context";
import { useSyncContext } from "../../contexts/sync-context";
import { useBookDeviceActions } from "../../hooks/use-book-device-actions";
import { usePersistentString } from "../../hooks/use-persistent-string";
import { queryHooks } from "../../services/db/hooks";
import { bookImportMutationKey, bookKeys, serialKeys } from "../../services/db/hooks/query-keys";
import type { Book, Series } from "../../services/db/schema";
import { IS_WEB_BUILD } from "../../services/sync";
import { IS_WEB } from "../../utils/platform";
import BatchImportSheet from "./batch-import";
import { toExistingTitles } from "./batch-import/use-folder-import";
import BookCard from "./book-card";
import BookEditSheet, { bookToEditValues, editValuesToPatch } from "./book-edit-sheet";
import BookListItem from "./book-list-item";
import FilterPopover from "./filter-popover";
import ImportSheet from "./import-sheet";
import PasteUrlModal from "./paste-url-modal";
import SeriesCard from "./series-card";
import SeriesListItem from "./series-list-item";
import { type FilterBy, filterAndSortLibrary, type SortBy, tagsInUse } from "./sort-filter";
import SortPopover from "./sort-popover";
import TransferModal from "./transfer-modal";
import { useLibraryImports } from "./use-library-imports";
import { useLibraryItems } from "./use-library-items";

const LOCAL_NOTICE_KEY = "lesefluss:local-notice-dismissed";
const SORT_BY_KEY = "lesefluss:library-sort";
const VIEW_MODE_KEY = "lesefluss:library-view-mode";

const SORT_VALUES: readonly SortBy[] = ["title", "author", "recent", "progress", "rating"];
const isSortBy = (value: string): value is SortBy =>
	(SORT_VALUES as readonly string[]).includes(value);
const isViewMode = (value: string): value is ViewMode => value === "grid" || value === "list";

const FAB_STYLE: React.CSSProperties = {
	bottom: "calc(var(--tab-bar-h,4rem) + env(safe-area-inset-bottom) + 1rem)",
};

const Library: React.FC = () => {
	const { isConnected } = useBLE();
	const {
		activeBookId,
		isTransferring,
		syncPosition,
		error: syncError,
		clearError,
	} = useBookSync();
	const { isLoggedIn, syncNow, isSyncing } = useSyncContext();
	const navigate = useNavigate();
	const qc = useQueryClient();

	const {
		books,
		series,
		covers,
		chapterCounts,
		seriesActivity,
		isLoading: isPending,
	} = useLibraryItems();

	const imports = useLibraryImports();
	const deleteMutation = queryHooks.useDeleteBook();
	const deleteSeriesMutation = queryHooks.useDeleteSeries();
	const updateMutation = queryHooks.useUpdateBook();

	const isGlobalImporting = useIsMutating({ mutationKey: bookImportMutationKey }) > 0;

	const [noticeDismissed, setNoticeDismissed] = useState(
		() => localStorage.getItem(LOCAL_NOTICE_KEY) === "1",
	);
	const [sortBy, setSortBy] = usePersistentString(SORT_BY_KEY, isSortBy, "recent");
	const [filterBy, setFilterBy] = useState<FilterBy>("all");
	const [tagFilter, setTagFilter] = useState<string | null>(null);
	const [search, setSearch] = useState("");
	const [isSearchOpen, setIsSearchOpen] = useState(false);
	const [viewMode, setViewMode] = usePersistentString(VIEW_MODE_KEY, isViewMode, "grid");

	const [selectedBook, setSelectedBook] = useState<Book | null>(null);
	const [selectedSeries, setSelectedSeries] = useState<Series | null>(null);
	const [importSheetOpen, setImportSheetOpen] = useState(false);
	const [batchImportOpen, setBatchImportOpen] = useState(false);
	const [urlModalOpen, setUrlModalOpen] = useState(false);

	const [pendingTransferBook, setPendingTransferBook] = useState<Book | null>(null);

	const [editBook, setEditBook] = useState<Book | null>(null);
	// Memoised for the same reason as in book-detail: the sheet reseeds its form
	// whenever `initial` changes, and `isSaving` guarantees a re-render on save.
	const editValues = useMemo(() => (editBook ? bookToEditValues(editBook) : null), [editBook]);
	const [pendingDeleteBook, setPendingDeleteBook] = useState<Book | null>(null);
	const [pendingDeleteSeries, setPendingDeleteSeries] = useState<Series | null>(null);

	// Reload when route becomes active (back from reader) so progress bars update.
	// Series aggregates also refresh: a chapter just read bumps latestRead and
	// started/finished counts that drive sort+filter.
	const location = useLocation();
	useEffect(() => {
		if (location.pathname === "/tabs/library") {
			qc.invalidateQueries({ queryKey: bookKeys.all });
			qc.invalidateQueries({ queryKey: serialKeys.all });
		}
	}, [location.pathname, qc]);

	useEffect(() => {
		if (!isTransferring) {
			qc.invalidateQueries({ queryKey: bookKeys.all });
		}
	}, [isTransferring, qc]);

	const dismissNotice = useCallback(() => {
		localStorage.setItem(LOCAL_NOTICE_KEY, "1");
		setNoticeDismissed(true);
	}, []);

	const handleImportUrl = (url: string) => {
		imports.importFromUrl(url, { onSuccess: () => setUrlModalOpen(false) });
	};

	const handleRefresh = async () => {
		await Promise.all([
			isConnected ? syncPosition() : undefined,
			isLoggedIn ? syncNow() : undefined,
		]);
		qc.invalidateQueries({ queryKey: bookKeys.all });
	};

	const openUploadModal = (book: Book) => {
		setSelectedBook(null);
		setPendingTransferBook(book);
	};

	const deviceActionsForSelectedBook = useBookDeviceActions({
		bookId: selectedBook?.id ?? null,
		bookTitle: selectedBook?.title,
		onUpload: () => {
			if (selectedBook) openUploadModal(selectedBook);
		},
	});

	const handleDelete = (book: Book) => {
		setSelectedBook(null);
		setPendingDeleteBook(book);
	};

	const handleDeleteConfirm = () => {
		if (!pendingDeleteBook) return;
		const book = pendingDeleteBook;
		setPendingDeleteBook(null);
		deleteMutation.mutate(book);
	};

	const handleOpenSeries = (s: Series) => {
		navigate({ to: "/tabs/library/series/$id", params: { id: s.id } });
	};

	const handleDeleteSeries = (s: Series) => {
		setSelectedSeries(null);
		setPendingDeleteSeries(s);
	};

	const handleDeleteSeriesConfirm = () => {
		if (!pendingDeleteSeries) return;
		const s = pendingDeleteSeries;
		setPendingDeleteSeries(null);
		deleteSeriesMutation.mutate(s);
	};

	const handleTransferDismiss = () => {
		setPendingTransferBook(null);
		qc.invalidateQueries({ queryKey: bookKeys.all });
	};

	const availableTags = tagsInUse(books);
	// Duplicate detection for a folder scan reads the library that is already
	// loaded here rather than issuing its own query.
	const existingTitles = useMemo(() => toExistingTitles(books), [books]);
	// A tag can vanish while it is the active filter (its last book edited or
	// deleted), which would otherwise leave the library empty with no way back.
	const activeTag = tagFilter !== null && availableTags.includes(tagFilter) ? tagFilter : null;
	// Dropped from state too, not just from the derived value: leaving it set
	// would re-arm the filter the moment a sync pull brought the tag back.
	useEffect(() => {
		if (tagFilter !== null && activeTag === null) setTagFilter(null);
	}, [tagFilter, activeTag]);
	const visibleItems = filterAndSortLibrary(books, series, seriesActivity, {
		filterBy,
		sortBy,
		search,
		tag: activeTag,
	});
	const isNarrowed = filterBy !== "all" || activeTag !== null || search.trim() !== "";

	if (isPending) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-background">
				<Loader2 className="size-6 animate-spin text-muted-foreground" />
			</div>
		);
	}

	const showSync = isConnected || isLoggedIn;

	return (
		<div className="bg-background">
			<TabHeader
				logo="/logo.png"
				title="Lesefluss"
				right={
					<>
						<Button
							variant="ghost"
							size="icon"
							aria-label="Search library"
							onClick={() => {
								setIsSearchOpen((open) => !open);
								setSearch("");
							}}
						>
							<Search />
						</Button>
						<FilterPopover
							trigger={
								<Button variant="ghost" size="icon" aria-label="Filter">
									<FilterIcon />
								</Button>
							}
							filterBy={filterBy}
							onFilter={setFilterBy}
							tags={availableTags}
							tag={activeTag}
							onTag={setTagFilter}
						/>
						<SortPopover
							trigger={
								<Button variant="ghost" size="icon" aria-label="Sort">
									<ArrowUpDown />
								</Button>
							}
							sortBy={sortBy}
							onSort={setSortBy}
						/>
						<Button
							variant="ghost"
							size="icon"
							onClick={() => navigate({ to: "/tabs/library/stats" })}
							aria-label="Reading stats"
						>
							<BarChart3 />
						</Button>
						{!IS_WEB && <BLEIndicator />}
						{showSync && (
							<Button
								variant="ghost"
								size="icon"
								disabled={isSyncing || isTransferring}
								onClick={handleRefresh}
								aria-label="Sync"
							>
								{isSyncing ? <Loader2 className="animate-spin" /> : <RefreshCcw />}
							</Button>
						)}
						<ViewModeToggle
							viewMode={viewMode}
							onToggle={() => setViewMode((m) => (m === "grid" ? "list" : "grid"))}
						/>
					</>
				}
			/>

			{isSearchOpen && (
				<div className="border-border border-b px-4 py-2">
					<Input
						autoFocus
						value={search}
						placeholder="Search title or author"
						onChange={(e) => setSearch(e.target.value)}
					/>
				</div>
			)}

			{/* Import progress. Determinate when we have a %, otherwise an animated stripe for sources without progress (URL, clipboard, share-intent). */}
			{isGlobalImporting &&
				(imports.progress > 0 ? (
					<Progress value={imports.progress} className="h-0.5 rounded-none" />
				) : (
					<div className="h-0.5 overflow-hidden bg-muted">
						<div className="h-full w-1/3 animate-[indeterminate-progress_1.2s_ease-in-out_infinite] bg-primary" />
					</div>
				))}

			{IS_WEB_BUILD && !isLoggedIn && !noticeDismissed && (
				<div className="flex items-start gap-3 border-border border-b bg-muted/60 px-4 py-3 text-sm">
					<span className="flex-1 text-muted-foreground">
						Your books are stored locally in this browser only and will be lost if you clear browser
						data.{" "}
						<a
							href="/tabs/settings/sync"
							className="font-medium text-primary underline-offset-4 hover:underline"
							onClick={(e) => {
								e.preventDefault();
								navigate({ to: "/tabs/settings/sync" });
							}}
						>
							Sign in
						</a>{" "}
						to keep them safe across devices.
					</span>
					<button
						type="button"
						onClick={dismissNotice}
						aria-label="Dismiss"
						className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
					>
						<X className="size-4" />
					</button>
				</div>
			)}

			{books.length === 0 && series.length === 0 ? (
				<div className="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center text-muted-foreground">
					<BookOpen className="mb-4 size-16 opacity-40" />
					<h2 className="m-0 mb-2 font-semibold text-foreground text-lg">No books yet</h2>
					<p className="m-0">Tap the + button to import a file or paste text.</p>
					{isGlobalImporting && <p className="m-0 mt-4">Importing...</p>}
				</div>
			) : visibleItems.length === 0 ? (
				<div className="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center text-muted-foreground">
					<p className="m-0">{isNarrowed ? "No books match." : "Nothing to show."}</p>
				</div>
			) : viewMode === "grid" ? (
				<div className="grid grid-cols-3 gap-4 p-4 pb-24 content-container md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
					{visibleItems.map((item) => {
						if (item.kind === "series") {
							const s = item.series;
							return (
								<SeriesCard
									key={s.id}
									series={s}
									chapterCount={chapterCounts.get(s.id)}
									onOpen={() => handleOpenSeries(s)}
									onMenu={() => setSelectedSeries(s)}
								/>
							);
						}
						const { book } = item;
						const progress = readingProgress(book);
						const started = book.wordPosition > 0;
						const cover = covers.get(book.id);
						return (
							<BookCard
								key={book.id}
								book={book}
								cover={cover}
								progress={progress}
								started={started}
								onOpen={() => {
									qc.setQueryData(bookKeys.detail(book.id), book);
									navigate({ to: "/tabs/reader/$id", params: { id: book.id } });
								}}
								onMenu={() => setSelectedBook(book)}
							/>
						);
					})}
				</div>
			) : (
				<div className="flex flex-col gap-2 p-4 pb-24 content-container">
					{visibleItems.map((item) => {
						if (item.kind === "series") {
							const s = item.series;
							return (
								<SeriesListItem
									key={s.id}
									series={s}
									chapterCount={chapterCounts.get(s.id)}
									onOpen={() => handleOpenSeries(s)}
									onMenu={() => setSelectedSeries(s)}
								/>
							);
						}
						const { book } = item;
						const progress = readingProgress(book);
						const started = book.wordPosition > 0;
						const cover = covers.get(book.id);
						return (
							<BookListItem
								key={book.id}
								book={book}
								cover={cover}
								progress={progress}
								started={started}
								onOpen={() => {
									qc.setQueryData(bookKeys.detail(book.id), book);
									navigate({ to: "/tabs/reader/$id", params: { id: book.id } });
								}}
								onMenu={() => setSelectedBook(book)}
							/>
						);
					})}
				</div>
			)}

			<button
				type="button"
				onClick={() => setImportSheetOpen(true)}
				disabled={imports.isImporting || isTransferring}
				aria-label="Add book"
				className="fixed right-4 z-30 inline-flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
				style={FAB_STYLE}
			>
				{imports.isImporting ? (
					<Loader2 className="size-6 animate-spin" />
				) : (
					<Plus className="size-6" />
				)}
			</button>

			<ImportSheet
				isOpen={importSheetOpen}
				onClose={() => setImportSheetOpen(false)}
				onPickFile={imports.importFromFile}
				onPickFolder={() => setBatchImportOpen(true)}
				onPickClipboard={imports.importFromClipboard}
				onPickUrl={() => setUrlModalOpen(true)}
			/>

			{batchImportOpen && (
				<BatchImportSheet
					isOpen
					existingTitles={existingTitles}
					onClose={() => setBatchImportOpen(false)}
				/>
			)}

			<PasteUrlModal
				isOpen={urlModalOpen}
				isImporting={imports.isUrlImporting}
				onClose={() => setUrlModalOpen(false)}
				onSubmit={handleImportUrl}
			/>

			<ActionSheet
				open={!!selectedBook}
				onOpenChange={(open) => {
					if (!open) setSelectedBook(null);
				}}
				title={selectedBook?.title}
				items={[
					{
						label: "Details",
						icon: BookText,
						onSelect: () => {
							if (selectedBook)
								navigate({ to: "/tabs/library/book/$id", params: { id: selectedBook.id } });
						},
					},
					{
						label: "Edit",
						icon: Pencil,
						onSelect: () => {
							if (selectedBook) setEditBook(selectedBook);
						},
					},
					...(!IS_WEB
						? deviceActionsForSelectedBook.map((a) => ({
								...a,
								disabled: a.disabled || isTransferring,
							}))
						: []),
					{
						label: "Delete",
						destructive: true,
						onSelect: () => {
							if (selectedBook) handleDelete(selectedBook);
						},
					},
				]}
			/>

			{!IS_WEB && (
				<TransferModal
					isOpen={!!pendingTransferBook}
					book={pendingTransferBook}
					activeBook={books.find((b) => b.id === activeBookId) ?? null}
					onDismiss={handleTransferDismiss}
				/>
			)}

			<ConfirmDialog
				open={!!imports.errorMessage}
				onOpenChange={(open) => {
					if (!open) imports.resetError();
				}}
				variant="info"
				title="Import Failed"
				description={imports.errorMessage ?? undefined}
			/>

			<ConfirmDialog
				open={!!syncError}
				onOpenChange={(open) => {
					if (!open) clearError();
				}}
				variant="info"
				title="Transfer Failed"
				description={syncError ?? undefined}
			/>

			{editBook && editValues && (
				<BookEditSheet
					isOpen
					onClose={() => setEditBook(null)}
					initial={editValues}
					progress={{ wordCount: editBook.wordCount, wordPosition: editBook.wordPosition }}
					isSaving={updateMutation.isPending}
					onSave={(values) => {
						updateMutation.mutate(
							{ id: editBook.id, values: editValuesToPatch(values) },
							{ onSuccess: () => setEditBook(null) },
						);
					}}
				/>
			)}

			<ConfirmDialog
				open={!!pendingDeleteBook}
				onOpenChange={(open) => {
					if (!open) setPendingDeleteBook(null);
				}}
				title="Delete book?"
				description={
					pendingDeleteBook
						? `"${pendingDeleteBook.title}" will be removed from your library.`
						: undefined
				}
				confirmLabel="Delete"
				destructive
				onConfirm={handleDeleteConfirm}
			/>

			<ActionSheet
				open={!!selectedSeries}
				onOpenChange={(open) => {
					if (!open) setSelectedSeries(null);
				}}
				title={selectedSeries?.title}
				items={[
					{
						label: "Details",
						icon: BookText,
						onSelect: () => {
							if (selectedSeries)
								navigate({ to: "/tabs/library/series/$id", params: { id: selectedSeries.id } });
						},
					},
					{
						label: "Delete series",
						destructive: true,
						onSelect: () => {
							if (selectedSeries) handleDeleteSeries(selectedSeries);
						},
					},
				]}
			/>

			<ConfirmDialog
				open={!!pendingDeleteSeries}
				onOpenChange={(open) => {
					if (!open) setPendingDeleteSeries(null);
				}}
				title="Delete series?"
				description={
					pendingDeleteSeries
						? `"${pendingDeleteSeries.title}" and all its chapters will be removed from your library.`
						: undefined
				}
				confirmLabel="Delete"
				destructive
				onConfirm={handleDeleteSeriesConfirm}
			/>
		</div>
	);
};

export default Library;
