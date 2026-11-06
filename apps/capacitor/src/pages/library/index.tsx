import { readingProgress } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { Progress } from "@lesefluss/ui/progress";
import { useIsMutating, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, useSearch } from "@tanstack/react-router";
import {
	ArrowUpDown,
	BarChart3,
	BookOpen,
	BookText,
	CheckSquare,
	Filter as FilterIcon,
	FolderMinus,
	FolderPlus,
	Loader2,
	MoreHorizontal,
	Pencil,
	Plus,
	RefreshCcw,
	Search,
	X,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { importRequest } from "../../commands/global";
import { useRegisterCommands } from "../../commands/registry";
import { ActionSheet } from "../../components/action-sheet";
import { TabHeader } from "../../components/app-shell/tab-header";
import BLEIndicator from "../../components/ble-indicator";
import { setBooksDragData } from "../../components/collections/drag-data";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { canSaveAsShelf, SaveShelfDialog } from "../../components/smart-shelves/save-shelf-dialog";
import { ShelfActions } from "../../components/smart-shelves/shelf-actions";
import { type ViewMode, ViewModeToggle } from "../../components/view-mode-toggle";
import { useBLE } from "../../contexts/ble-context";
import { useBookSync } from "../../contexts/book-sync-context";
import { useSyncContext } from "../../contexts/sync-context";
import { useBookDeviceActions } from "../../hooks/use-book-device-actions";
import { useMediaQuery } from "../../hooks/use-media-query";
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
import BulkActionBar from "./bulk-action-bar";
import BulkSheets from "./bulk-sheets";
import CollectionPicker from "./collection-picker";
import CollectionShelfRow from "./collection-shelf-row";
import { libraryCommands } from "./commands";
import { filterToTree, matchesTree, serializeTree } from "./condition-tree";
import FilterBar, { AddFilterButton } from "./filter-bar";
import { activeFilterCount, type Facet, type LibraryFilter, pruneFilter } from "./filter-model";
import { FilterPopover, FilterSheet, facetOptions } from "./filter-picker";
import ImportSheet from "./import-sheet";
import PasteUrlModal from "./paste-url-modal";
import { searchTextOf } from "./query-syntax";
import { SearchAutocomplete } from "./search-autocomplete";
import SeriesCard from "./series-card";
import SeriesListItem from "./series-list-item";
import {
	applyLibraryView,
	buildLibraryItems,
	type LibraryItem,
	type SortBy,
	tagsInUse,
} from "./sort-filter";
import SortPopover from "./sort-popover";
import TransferModal from "./transfer-modal";
import { useDragSelect } from "./use-drag-select";
import { useLibraryFilter } from "./use-library-filter";
import { useLibraryImports } from "./use-library-imports";
import { useLibraryItems } from "./use-library-items";
import { useLibrarySelection } from "./use-library-selection";
import { editShelfConditionsRequest, type ShelfEntry, useSmartShelves } from "./use-smart-shelves";
import VirtualBookGrid from "./virtual-book-grid";

const LOCAL_NOTICE_KEY = "lesefluss:local-notice-dismissed";
const SORT_BY_KEY = "lesefluss:library-sort";
const VIEW_MODE_KEY = "lesefluss:library-view-mode";
/** Facets whose values come from the books; a value can vanish with its last book. */
const LIBRARY_VALUE_FACETS: readonly Facet[] = ["tags", "author", "series", "collection"];

const SORT_VALUES: readonly SortBy[] = ["title", "author", "recent", "progress", "rating"];
const isSortBy = (value: string): value is SortBy =>
	(SORT_VALUES as readonly string[]).includes(value);
const isViewMode = (value: string): value is ViewMode => value === "grid" || value === "list";

const FAB_STYLE: React.CSSProperties = {
	bottom: "calc(var(--tab-bar-h,4rem) + var(--safe-bottom) + 1rem)",
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
	const { collection: collectionId, shelf: shelfId } = useSearch({ from: "/tabs/library/" });
	const collectionsQuery = queryHooks.useCollections();
	const membersQuery = queryHooks.useCollectionBookIds(collectionId ?? null);
	const membershipsQuery = queryHooks.useCollectionMemberships();
	const activeCollection = collectionsQuery.data?.find((c) => c.id === collectionId);
	const removeFromCollection = queryHooks.useRemoveBooksFromCollection();
	const smart = useSmartShelves();
	const activeShelf = shelfId ? smart.shelves.find((s) => s.id === shelfId) : undefined;
	const updateShelf = queryHooks.useUpdateSmartShelf();
	const [shelfMenuFor, setShelfMenuFor] = useState<ShelfEntry | null>(null);
	const [isSavingShelf, setIsSavingShelf] = useState(false);

	const {
		books,
		series,
		covers,
		chapterCounts,
		seriesActivity,
		isLoading: isLibraryPending,
	} = useLibraryItems();
	// The Collection facet and its pruning need both; mid-load every collection looks deleted.
	const isPending =
		isLibraryPending ||
		collectionsQuery.isPending ||
		membershipsQuery.isPending ||
		(!!shelfId && smart.isLoading);

	const imports = useLibraryImports();
	const deleteMutation = queryHooks.useDeleteBook();
	const deleteSeriesMutation = queryHooks.useDeleteSeries();
	const updateMutation = queryHooks.useUpdateBook();

	const isGlobalImporting = useIsMutating({ mutationKey: bookImportMutationKey }) > 0;

	const [noticeDismissed, setNoticeDismissed] = useState(
		() => localStorage.getItem(LOCAL_NOTICE_KEY) === "1",
	);
	const [sortBy, setSortBy] = usePersistentString(SORT_BY_KEY, isSortBy, "recent");
	const [filter, setFilter] = useLibraryFilter();
	const [isFilterOpen, setIsFilterOpen] = useState(false);
	const isDesktop = useMediaQuery("(min-width: 768px)");
	// Native drag needs a mouse; on touch a held card starts drag-select instead.
	const canDragBooks = useMediaQuery("(hover: hover) and (pointer: fine)");
	// Search is deliberately not persisted: a query restored into a collapsed
	// search bar would look like an empty library with no visible cause.
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
	const [pickerBook, setPickerBook] = useState<Book | null>(null);
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

	// A collection deleted here or on another device leaves a stale id in the URL.
	useEffect(() => {
		if (
			collectionId &&
			collectionsQuery.isSuccess &&
			!collectionsQuery.isFetching &&
			!activeCollection
		) {
			navigate({ to: "/tabs/library", search: {}, replace: true });
		}
	}, [
		collectionId,
		collectionsQuery.isSuccess,
		collectionsQuery.isFetching,
		activeCollection,
		navigate,
	]);

	useEffect(() => {
		if (shelfId && smart.isSettled && !activeShelf) {
			navigate({ to: "/tabs/library", search: {}, replace: true });
		}
	}, [shelfId, smart.isSettled, activeShelf, navigate]);

	editShelfConditionsRequest.useHandler(() => setIsFilterOpen(true));

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

	importRequest.useHandler(() => setImportSheetOpen(true));
	useRegisterCommands(
		libraryCommands({
			books,
			series,
			openBook: (book) => {
				qc.setQueryData(bookKeys.detail(book.id), book);
				navigate({ to: "/tabs/reader/$id", params: { id: book.id } });
			},
			openSeries: handleOpenSeries,
			openUrlImport: () => setUrlModalOpen(true),
			pasteFromClipboard: imports.importFromClipboard,
			isImporting: imports.isImporting || isTransferring,
		}),
	);

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

	const availableTags = useMemo(() => tagsInUse(books), [books]);
	// Duplicate detection for a folder scan reads the library that is already
	// loaded here rather than issuing its own query.
	const existingTitles = useMemo(() => toExistingTitles(books), [books]);
	const allItems = useMemo(
		() => buildLibraryItems(books, series, seriesActivity, Date.now(), membershipsQuery.data),
		[books, series, seriesActivity, membershipsQuery.data],
	);
	const options = useMemo(
		() => facetOptions(allItems, collectionsQuery.data),
		[allItems, collectionsQuery.data],
	);
	// A value can vanish while it is filtered on (a tag's last book edited or
	// deleted), which would leave an empty library with no visible cause.
	// Not inside a shelf: a pruned condition would widen the shelf instead of emptying it.
	const activeFilter = useMemo(
		() =>
			shelfId
				? filter
				: LIBRARY_VALUE_FACETS.reduce<LibraryFilter>(
						(f, facet) => pruneFilter(f, facet, new Set(options[facet].map((o) => o.value))),
						filter,
					),
		[filter, options, shelfId],
	);
	// Dropped from state too, so a sync pull that brings the value back does not
	// re-arm it. Held off until the books are in: mid-load every value looks missing.
	useEffect(() => {
		if (!isPending && activeFilter !== filter) setFilter(activeFilter);
	}, [isPending, activeFilter, filter, setFilter]);
	// Narrowed after the filter options and pruning above, which read the whole
	// library: opening a collection must not prune the user's saved filter values.
	const scopedItems = useMemo(() => {
		// A shelf the chips cannot show narrows by its own tree.
		if (activeShelf && !activeShelf.filter) {
			const { tree } = activeShelf;
			return tree ? allItems.filter((item) => matchesTree(item.facets, tree.root)) : [];
		}
		if (!collectionId) return allItems;
		const members = new Set(membersQuery.data ?? []);
		return allItems.filter((item) => item.kind === "book" && members.has(item.book.id));
	}, [allItems, collectionId, membersQuery.data, activeShelf]);
	const visibleItems = useMemo(
		() =>
			applyLibraryView(scopedItems, { filter: activeFilter, sortBy, search: searchTextOf(search) }),
		[scopedItems, activeFilter, sortBy, search],
	);
	const filterCount = activeFilterCount(activeFilter);
	const canSaveFilter = canSaveAsShelf(activeFilter);
	const shelfIsEdited =
		!!activeShelf?.filter &&
		serializeTree(filterToTree(activeFilter)) !== serializeTree(filterToTree(activeShelf.filter));
	const isNarrowed = filterCount > 0 || searchTextOf(search).trim() !== "";
	const isCollectionEmpty = !!collectionId && membersQuery.isSuccess && scopedItems.length === 0;
	const selection = useLibrarySelection(books, visibleItems);
	const gridRef = useRef<HTMLDivElement>(null);
	useDragSelect(gridRef, {
		isActive: selection.drag.isActive,
		onOver: selection.drag.over,
		onEnd: selection.drag.end,
	});

	if (isPending) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-background">
				<Loader2 className="size-6 animate-spin text-muted-foreground" />
			</div>
		);
	}

	const showSync = isConnected || isLoggedIn;

	const openBook = (book: Book) => {
		qc.setQueryData(bookKeys.detail(book.id), book);
		navigate({ to: "/tabs/reader/$id", params: { id: book.id } });
	};

	const renderItem = (item: LibraryItem) => {
		if (item.kind === "series") {
			const s = item.series;
			const Item = viewMode === "grid" ? SeriesCard : SeriesListItem;
			return (
				// Not selectable in v1, and a stray tap that navigated away
				// would throw away a half-built selection.
				<div
					inert={selection.isSelecting}
					className={selection.isSelecting ? "pointer-events-none opacity-40" : undefined}
				>
					<Item
						series={s}
						chapterCount={chapterCounts.get(s.id)}
						onOpen={() => handleOpenSeries(s)}
						onMenu={() => setSelectedSeries(s)}
					/>
				</div>
			);
		}
		const { book } = item;
		const progress = readingProgress(book);
		const Item = viewMode === "grid" ? BookCard : BookListItem;
		return (
			<Item
				book={book}
				cover={covers.get(book.id)}
				progress={progress}
				started={progress > 0}
				selectable={selection.isSelecting}
				selected={selection.isSelected(book.id)}
				onToggle={() => selection.toggle(book.id)}
				onModifiedClick={(e) =>
					e.shiftKey ? selection.selectRange(book.id) : selection.toggle(book.id)
				}
				onLongPress={() => selection.drag.start(book.id)}
				onOpen={() => openBook(book)}
				onMenu={() => setSelectedBook(book)}
				draggable={canDragBooks}
			/>
		);
	};

	const handleBookDragStart = (e: React.DragEvent) => {
		const bookId = (e.target as Element).closest<HTMLElement>("[data-book-id]")?.dataset.bookId;
		if (!bookId) return;
		const ids = selection.isSelected(bookId) ? selection.picked.map((b) => b.id) : [bookId];
		setBooksDragData(e.dataTransfer, ids);
	};

	return (
		// The grid's virtualizer observes this root for header changes, so the
		// drag handler lives here rather than on a wrapper around the grid.
		<div className="bg-background" onDragStart={canDragBooks ? handleBookDragStart : undefined}>
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
						{!isDesktop && (
							<Button
								variant="ghost"
								size="icon"
								aria-label={filterCount > 0 ? `Filter, ${filterCount} active` : "Filter"}
								className="relative"
								onClick={() => setIsFilterOpen(true)}
							>
								<FilterIcon />
								{filterCount > 0 && (
									<span
										aria-hidden
										className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-primary px-1 font-semibold text-[10px] text-primary-foreground leading-4"
									>
										{filterCount}
									</span>
								)}
							</Button>
						)}
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

			{selection.isSelecting && <BulkActionBar selection={selection} />}

			{isSearchOpen && (
				<div className="border-border border-b px-4 py-2">
					<SearchAutocomplete
						value={search}
						onValueChange={setSearch}
						filter={activeFilter}
						onFilterChange={setFilter}
						options={options}
					/>
				</div>
			)}

			{(books.length > 0 || (collectionsQuery.data?.length ?? 0) > 0) && (
				<CollectionShelfRow activeId={collectionId} activeShelfId={shelfId} />
			)}

			{activeCollection && (
				<div className="flex items-center gap-2 border-border border-b px-4 py-2">
					<h2 className="m-0 min-w-0 flex-1 truncate font-semibold text-base">
						{activeCollection.name}
						<span className="ml-2 font-normal text-muted-foreground text-sm tabular-nums">
							{activeCollection.bookCount}
						</span>
					</h2>
					<Button
						variant="ghost"
						size="icon"
						aria-label="Show all books"
						onClick={() => navigate({ to: "/tabs/library", search: {} })}
					>
						<X />
					</Button>
				</div>
			)}

			{activeShelf && (
				<div
					className="flex items-center gap-2 border-border border-b px-4 py-2"
					data-testid="smart-shelf-header"
				>
					<h2 className="m-0 min-w-0 flex-1 truncate font-semibold text-base">
						{activeShelf.name}
						<span className="ml-2 font-normal text-muted-foreground text-sm tabular-nums">
							{smart.counts.get(activeShelf.id) ?? 0}
						</span>
						{!activeShelf.filter && (
							<span className="ml-2 font-normal text-muted-foreground text-xs">
								Custom conditions
							</span>
						)}
					</h2>
					{!activeShelf.isBuiltIn && shelfIsEdited && (
						<Button
							size="sm"
							variant="outline"
							disabled={!canSaveFilter || updateShelf.isPending}
							onClick={() =>
								updateShelf.mutate({
									id: activeShelf.id,
									conditions: serializeTree(filterToTree(activeFilter)),
								})
							}
						>
							Update shelf
						</Button>
					)}
					<Button
						variant="ghost"
						size="icon"
						aria-label={`${activeShelf.name} options`}
						onClick={() => setShelfMenuFor(activeShelf)}
					>
						<MoreHorizontal />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						aria-label="Show all books"
						onClick={() => navigate({ to: "/tabs/library", search: {} })}
					>
						<X />
					</Button>
				</div>
			)}
			<ShelfActions
				shelf={shelfMenuFor}
				onClose={() => setShelfMenuFor(null)}
				setBuiltInPinned={smart.setBuiltInPinned}
			/>
			<SaveShelfDialog open={isSavingShelf} onOpenChange={setIsSavingShelf} filter={activeFilter} />

			{(books.length > 0 || series.length > 0) && (
				<FilterBar
					filter={activeFilter}
					onChange={setFilter}
					options={options}
					onSaveShelf={
						canSaveFilter && (!activeShelf || shelfIsEdited)
							? () => setIsSavingShelf(true)
							: undefined
					}
					addFilter={
						isDesktop ? (
							<FilterPopover
								open={isFilterOpen}
								onOpenChange={setIsFilterOpen}
								filter={activeFilter}
								onChange={setFilter}
								options={options}
								resultCount={visibleItems.length}
								trigger={<AddFilterButton />}
							/>
						) : undefined
					}
				/>
			)}
			{!isDesktop && (
				<FilterSheet
					open={isFilterOpen}
					onOpenChange={setIsFilterOpen}
					filter={activeFilter}
					onChange={setFilter}
					options={options}
					resultCount={visibleItems.length}
					onSaveShelf={
						canSaveFilter && (!activeShelf || shelfIsEdited)
							? () => {
									setIsFilterOpen(false);
									setIsSavingShelf(true);
								}
							: undefined
					}
				/>
			)}

			{/* Import progress. Determinate when we have a %, otherwise an animated stripe for sources without progress (URL, clipboard, share-intent). */}
			{isGlobalImporting &&
				(imports.progress > 0 ? (
					<Progress
						value={imports.progress}
						className="h-0.5 rounded-none"
						aria-label="Importing"
					/>
				) : (
					<div className="h-0.5 overflow-hidden bg-muted">
						<div className="h-full w-1/3 animate-[indeterminate-progress_1.2s_ease-in-out_infinite] bg-primary" />
					</div>
				))}

			{/* Bulk progress reuses the import strip's slot. ConfirmDialog has no
			    pending state, so there is nowhere else for it to live. */}
			{selection.isRunning && selection.progress.total > 0 && (
				<Progress
					value={(selection.progress.done / selection.progress.total) * 100}
					className="h-0.5 rounded-none"
					aria-label="Applying to selected books"
				/>
			)}

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
			) : isCollectionEmpty ? (
				<div className="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center text-muted-foreground">
					<h2 className="m-0 mb-2 font-semibold text-foreground text-lg">
						No books in this collection yet
					</h2>
					<p className="m-0">
						Add one from a book's menu{canDragBooks ? ", or drag books onto the collection" : ""}.
					</p>
				</div>
			) : visibleItems.length === 0 ? (
				collectionId && !membersQuery.isSuccess ? null : (
					<div className="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center text-muted-foreground">
						<p className="m-0">{isNarrowed ? "No books match." : "Nothing to show."}</p>
					</div>
				)
			) : (
				<VirtualBookGrid
					items={visibleItems}
					viewMode={viewMode}
					renderItem={renderItem}
					containerRef={gridRef}
					onBackgroundTap={selection.isSelecting ? selection.exit : undefined}
				/>
			)}

			{/* Hidden while selecting: it would sit under the selection UI, and
			    suppressing new imports mid-selection is a welcome side effect. */}
			<button
				type="button"
				hidden={selection.isSelecting}
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
					{
						label: "Select",
						icon: CheckSquare,
						onSelect: () => {
							if (selectedBook) selection.begin(selectedBook.id);
						},
					},
					{
						label: "Add to collection…",
						icon: FolderPlus,
						onSelect: () => {
							if (selectedBook) setPickerBook(selectedBook);
						},
					},
					...(activeCollection
						? [
								{
									label: `Remove from ${activeCollection.name}`,
									icon: FolderMinus,
									onSelect: () => {
										if (selectedBook)
											removeFromCollection.mutate({
												collectionId: activeCollection.id,
												bookIds: [selectedBook.id],
											});
									},
								},
							]
						: []),
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

			<BulkSheets selection={selection} libraryTags={availableTags} />

			<CollectionPicker book={pickerBook} onClose={() => setPickerBook(null)} />

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
							{ id: editBook.id, values: editValuesToPatch(values, editValues ?? undefined) },
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
