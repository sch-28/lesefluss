import { Button } from "@lesefluss/ui/button";
import { Progress } from "@lesefluss/ui/progress";
import { useIsMutating, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate, useSearch } from "@tanstack/react-router";
import {
	ArrowUpDown,
	BookOpen,
	BookText,
	Compass,
	Cpu,
	Filter as FilterIcon,
	FolderMinus,
	Library as LibraryIcon,
	Loader2,
	MoreHorizontal,
	Plus,
	RefreshCcw,
	SearchX,
	SquareCheck,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { importRequest } from "../../commands/global";
import { withKey } from "../../commands/keys";
import { useCommandKey, useRegisterCommands } from "../../commands/registry";
import { ActionSheet } from "../../components/action-sheet";
import { PageHeader } from "../../components/app-shell/page-header";
import { addButtonShown, tabBarHidden } from "../../components/app-shell/tab-bar-visibility";
import { TabHeader } from "../../components/app-shell/tab-header";
import BLEIndicator from "../../components/ble-indicator";
import { CollectionMenuButton } from "../../components/collections/collection-actions";
import { setBooksDragData } from "../../components/collections/drag-data";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { EmptyState } from "../../components/empty-state";
import { HeaderGoalRing } from "../../components/header-goal-ring";
import { NoticeBar } from "../../components/notice-bar";
import { PageContainer } from "../../components/page-container";
import { canSaveAsShelf, SaveShelfDialog } from "../../components/smart-shelves/save-shelf-dialog";
import { ShelfActions } from "../../components/smart-shelves/shelf-actions";
import { toast } from "../../components/toast";
import { WebLimitsLine } from "../../components/web-limitations";
import { useBLE } from "../../contexts/ble-context";
import { useBookSync } from "../../contexts/book-sync-context";
import { useSyncContext } from "../../contexts/sync-context";
import { useBookDeviceActions } from "../../hooks/use-book-device-actions";
import { useLocalDayNow } from "../../hooks/use-local-day";
import { useMediaQuery, WIDE_QUERY } from "../../hooks/use-media-query";
import { usePersistentString } from "../../hooks/use-persistent-string";
import { queryHooks } from "../../services/db/hooks";
import { bookImportMutationKey, bookKeys, serialKeys } from "../../services/db/hooks/query-keys";
import type { BulkAction } from "../../services/db/hooks/use-bulk-books";
import type { Book, Series } from "../../services/db/schema";
import { isFirstLoad } from "../../services/query-client";
import { IS_WEB_BUILD } from "../../services/sync";
import { IS_WEB } from "../../utils/platform";
import { isLeavingReader } from "../reader/leave-invalidation";
import BatchImportSheet from "./batch-import";
import { toExistingTitles } from "./batch-import/use-folder-import";
import { useBookActions } from "./book-actions/use-book-actions";
import BookCard from "./book-card";
import BookListItem from "./book-list-item";
import BulkActionBar from "./bulk-action-bar";
import BulkSheets from "./bulk-sheets";
import {
	type CardFieldId,
	type CardSurface,
	cardFieldValues,
	cardStatus,
	useCardFields,
} from "./card-fields";
import CollectionShelfRow from "./collection-shelf-row";
import { libraryCommands } from "./commands";
import { filterToTree, matchesTree, serializeTree } from "./condition-tree";
import FilterBar from "./filter-bar";
import { activeFilterCount, type Facet, type LibraryFilter, pruneFilter } from "./filter-model";
import { FilterPopover, FilterSheet, facetOptions } from "./filter-picker";
import { displayOrder, groupLibrary, type SeriesMemberships, seriesBadge } from "./group-by";
import { headerControls, type LibraryViewMode } from "./header-controls";
import ImportSheet from "./import-sheet";
import { libraryNotice } from "./library-notice";
import LibraryTable from "./library-table";
import OrderedCollectionView, { type OrderedCardOptions } from "./ordered-collection-view";
import PasteTextModal from "./paste-text-modal";
import PasteUrlModal from "./paste-url-modal";
import { searchTextOf } from "./query-syntax";
import { SearchAutocomplete } from "./search-autocomplete";
import SeriesCard from "./series-card";
import SeriesListItem from "./series-list-item";
import { ShelfConditionEditor } from "./shelf-condition-editor";
import {
	applyLibraryView,
	buildLibraryItems,
	type LibraryItem,
	type SortBy,
	type SortState,
	tagsInUse,
} from "./sort-filter";
import SortPopover, { type PopoverSortBy, SERIES_ORDER } from "./sort-popover";
import { type CellContext, headerSort } from "./table-columns";
import TransferModal from "./transfer-modal";
import { UpdateShelfAction } from "./update-shelf-action";
import { useCollapsedGroups } from "./use-collapsed-groups";
import { useDragSelect } from "./use-drag-select";
import { useLeaveMissingShelf, useLibraryFilter } from "./use-library-filter";
import { useLibraryImports } from "./use-library-imports";
import { useLibraryItems } from "./use-library-items";
import { useLibraryKeyboard } from "./use-library-keyboard";
import { useLibrarySearch } from "./use-library-search";
import { useLibrarySelection } from "./use-library-selection";
import { type ShelfViewTarget, useLibraryView } from "./use-library-view";
import { type ShelfEntry, useSmartShelves } from "./use-smart-shelves";
import { ViewSheet } from "./view-sheet";
import VirtualBookGrid from "./virtual-book-grid";

const LOCAL_NOTICE_KEY = "lesefluss:local-notice-dismissed";
const VIEW_MODE_KEY = "lesefluss:library-view-mode";
const SERIES_VIEW_MODE_KEY = "lesefluss:series-view-mode";
/** Facets whose values come from the books; a value can vanish with its last book. */
const LIBRARY_VALUE_FACETS: readonly Facet[] = ["tags", "author", "series", "collection"];

const NO_SERIES_MEMBERSHIPS: SeriesMemberships = new Map();
const isViewMode = (value: string): value is LibraryViewMode =>
	value === "grid" || value === "list" || value === "table";

type SeriesSort = Omit<SortState, "sortBy"> & { sortBy: PopoverSortBy };
const IN_SERIES_ORDER: SeriesSort = {
	sortBy: SERIES_ORDER,
	reversed: false,
	thenBy: null,
	thenReversed: false,
};

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
	const speedModelQuery = queryHooks.useStatsSpeedModel();
	const seriesMembershipsQuery = queryHooks.useSeriesMemberships();
	const activeCollection = collectionsQuery.data?.find((c) => c.id === collectionId);
	const isOrderedView = !!activeCollection?.ordered;
	const removeFromCollection = queryHooks.useRemoveBooksFromCollection();
	const smart = useSmartShelves();
	const activeShelf = shelfId ? smart.shelves.find((s) => s.id === shelfId) : undefined;
	const updateShelf = queryHooks.useUpdateSmartShelf();
	const [shelfMenuFor, setShelfMenuFor] = useState<ShelfEntry | null>(null);
	const [isSavingShelf, setIsSavingShelf] = useState(false);
	const [isEditingShelf, setIsEditingShelf] = useState(false);
	const shelfDay = useLocalDayNow();

	const {
		books,
		series,
		covers,
		chapterCounts,
		seriesActivity,
		seriesLengths,
		isLoading: isLibraryPending,
	} = useLibraryItems();
	// The Collection facet and its pruning need both; mid-load every collection looks deleted.
	const isPending =
		isLibraryPending ||
		isFirstLoad(collectionsQuery) ||
		isFirstLoad(membershipsQuery) ||
		(!!shelfId && smart.isLoading);

	const imports = useLibraryImports(collectionId);
	const deleteSeriesMutation = queryHooks.useDeleteSeries();

	const isGlobalImporting = useIsMutating({ mutationKey: bookImportMutationKey }) > 0;

	const [noticeDismissed, setNoticeDismissed] = useState(
		() => localStorage.getItem(LOCAL_NOTICE_KEY) === "1",
	);
	const setCollectionView = queryHooks.useSetCollectionView();
	const shelfViewTarget: ShelfViewTarget | null =
		activeCollection && !isOrderedView
			? {
					id: activeCollection.id,
					view: activeCollection.view,
					save: (view) => setCollectionView.mutate({ id: activeCollection.id, view }),
				}
			: activeShelf && !activeShelf.isBuiltIn
				? {
						id: activeShelf.id,
						view: activeShelf.view,
						save: (view) => updateShelf.mutate({ id: activeShelf.id, view }),
					}
				: null;
	const libraryView = useLibraryView(shelfViewTarget);
	const { setSort: setLibrarySort, groupBy, setGroupBy, columnIds, tableColumns } = libraryView;
	// A series opens in its own #N order; another sort there lasts while it is open.
	const [seriesSort, setSeriesSort] = useState(IN_SERIES_ORDER);
	// biome-ignore lint/correctness/useExhaustiveDependencies: opening another collection is the reset trigger
	useEffect(() => setSeriesSort(IN_SERIES_ORDER), [collectionId]);
	const shownSort = isOrderedView ? seriesSort : libraryView.sort;
	const isInSeriesOrder = shownSort.sortBy === SERIES_ORDER;
	// The series view puts its matches in #N order itself; any sort is fine underneath.
	const sort: SortState = isInSeriesOrder
		? { ...shownSort, sortBy: "title", reversed: false }
		: { ...shownSort, sortBy: shownSort.sortBy as SortBy };
	const setSort = (patch: Partial<SeriesSort>) => {
		if (isOrderedView) setSeriesSort((current) => ({ ...current, ...patch }));
		else if (patch.sortBy !== SERIES_ORDER) setLibrarySort(patch as Partial<SortState>);
	};
	const { sortBy } = sort;
	const [collapsedGroups, toggleGroup] = useCollapsedGroups(groupBy);
	const [filter, setFilter] = useLibraryFilter();
	const [isFilterOpen, setIsFilterOpen] = useState(false);
	const isDesktop = useMediaQuery("(min-width: 768px)");
	// Native drag needs a mouse; on touch a held card starts drag-select instead.
	const canDragBooks = useMediaQuery("(hover: hover) and (pointer: fine)");
	const { search, setSearch, isSearchOpen, setIsSearchOpen, closeSearch } = useLibrarySearch();
	const [isSearchFocused, setSearchFocused] = useState(false);
	// A collection, shelf or series opens with all its books, so a query typed elsewhere goes.
	useEffect(() => {
		if (collectionId || shelfId) closeSearch();
	}, [collectionId, shelfId, closeSearch]);
	const [libraryViewMode, setLibraryViewMode] = usePersistentString(
		VIEW_MODE_KEY,
		isViewMode,
		"grid",
	);
	// A series opens as a grid of covers, whatever layout the library has.
	const [seriesViewMode, setSeriesViewMode] = usePersistentString(
		SERIES_VIEW_MODE_KEY,
		isViewMode,
		"grid",
	);
	const viewMode = isOrderedView ? seriesViewMode : libraryViewMode;
	const setViewMode = isOrderedView ? setSeriesViewMode : setLibraryViewMode;
	// The table needs the width (its default columns fit from 1024 px beside the
	// sidebar rail); a narrower window shows a stored table as the list. A series'
	// #N order and its drag-reorder live on the cards, so it shows the table as the list.
	const canTable = useMediaQuery(WIDE_QUERY) && !isOrderedView;
	const shownView: LibraryViewMode = viewMode === "table" && !canTable ? "list" : viewMode;
	const isEmptyLibrary = !isPending && books.length === 0 && series.length === 0;
	const controls = headerControls({ isEmptyLibrary });
	const cardFields = useCardFields();
	const highlightCountsQuery = queryHooks.useHighlightCounts(
		(shownView === "table" && columnIds.includes("highlights")) ||
			sortBy === "highlights" ||
			sort.thenBy === "highlights",
	);

	const [selectedBook, setSelectedBook] = useState<Book | null>(null);
	const [selectedSeries, setSelectedSeries] = useState<Series | null>(null);
	const [importSheetOpen, setImportSheetOpen] = useState(false);
	const [batchImportOpen, setBatchImportOpen] = useState(false);
	const [urlModalOpen, setUrlModalOpen] = useState(false);

	const [pendingTransferBook, setPendingTransferBook] = useState<Book | null>(null);

	const [pendingDeleteSeries, setPendingDeleteSeries] = useState<Series | null>(null);

	// Reload when route becomes active (back from reader) so progress bars update.
	// Series aggregates also refresh: a chapter just read bumps latestRead and
	// started/finished counts that drive sort+filter.
	const location = useLocation();
	useEffect(() => {
		if (location.pathname === "/tabs/library") {
			if (!isLeavingReader()) qc.invalidateQueries({ queryKey: bookKeys.all });
			qc.invalidateQueries({ queryKey: serialKeys.all });
		}
	}, [location.pathname, qc]);

	// A finished transfer writes the active book without refreshing the list itself.
	const wasTransferringRef = useRef(isTransferring);
	useEffect(() => {
		if (wasTransferringRef.current && !isTransferring) {
			qc.invalidateQueries({ queryKey: bookKeys.all });
		}
		wasTransferringRef.current = isTransferring;
	}, [isTransferring, qc]);

	// A collection deleted here or on another device leaves a stale id in the URL. Only a link
	// to one never shown here says so: emptying the open series already toasts, with an Undo.
	const shownCollectionRef = useRef<string | null>(null);
	useEffect(() => {
		if (activeCollection) shownCollectionRef.current = activeCollection.id;
		if (
			collectionId &&
			collectionsQuery.isSuccess &&
			!collectionsQuery.isFetching &&
			!activeCollection
		) {
			if (shownCollectionRef.current !== collectionId) {
				toast.info("That collection no longer exists", { id: "missing-collection" });
			}
			navigate({ to: "/tabs/library", search: {}, replace: true });
		}
	}, [
		collectionId,
		collectionsQuery.isSuccess,
		collectionsQuery.isFetching,
		activeCollection,
		navigate,
	]);

	useLeaveMissingShelf(shelfId, smart.isSettled && !activeShelf);

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

	const bookActions = useBookActions({
		surface: "card",
		onSelect: (book) => selection.begin(book.id),
		extras: (book) => [
			...(activeCollection
				? [
						{
							label: `Remove from ${activeCollection.name}`,
							icon: FolderMinus,
							onSelect: () =>
								removeFromCollection.mutate({
									collectionId: activeCollection.id,
									bookIds: [book.id],
								}),
						},
					]
				: []),
			...(!IS_WEB
				? deviceActionsForSelectedBook.map((a) => ({
						...a,
						icon: a.icon ?? Cpu,
						disabled: a.disabled || isTransferring,
					}))
				: []),
		],
	});
	const openBookMenu = (book: Book) => {
		// The device actions are a hook on this book, so it is kept here as well.
		setSelectedBook(book);
		bookActions.open(book);
	};

	const openAddBooks = () => {
		if (collectionId) {
			navigate({ to: "/tabs/library/collections/$id/add", params: { id: collectionId } });
		}
	};

	const handleOpenSeries = (s: Series) => {
		navigate({ to: "/tabs/library/series/$id", params: { id: s.id } });
	};

	importRequest.useHandler(() => setImportSheetOpen(true));
	const importKey = useCommandKey("global.import");
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
	const bulkActions = queryHooks.useBulkBookActions();
	// One after another: each edit re-reads the book, so a quick second tag toggle
	// must not read it before the first one is written.
	const editQueueRef = useRef<Promise<unknown>>(Promise.resolve());
	const editBook = (book: Book, action: BulkAction) => {
		editQueueRef.current = editQueueRef.current.then(async () => {
			const outcome = await bulkActions.run(action, [book]);
			const failure = outcome.failures[0];
			if (failure) toast.error(failure.reason);
		});
	};
	// Duplicate detection for a folder scan reads the library that is already
	// loaded here rather than issuing its own query.
	const existingTitles = useMemo(() => toExistingTitles(books), [books]);
	const collectionsById = useMemo(
		() => new Map((collectionsQuery.data ?? []).map((c) => [c.id, c])),
		[collectionsQuery.data],
	);
	const allItems = useMemo(
		() =>
			buildLibraryItems(
				books,
				series,
				seriesActivity,
				Date.now(),
				membershipsQuery.data,
				speedModelQuery.data,
				{
					collections: collectionsById,
					seriesMemberships: seriesMembershipsQuery.data ?? NO_SERIES_MEMBERSHIPS,
				},
				highlightCountsQuery.data,
			),
		[
			books,
			series,
			seriesActivity,
			membershipsQuery.data,
			speedModelQuery.data,
			collectionsById,
			seriesMembershipsQuery.data,
			highlightCountsQuery.data,
		],
	);
	const options = useMemo(
		() => facetOptions(allItems, collectionsQuery.data, filter),
		[allItems, collectionsQuery.data, filter],
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
			return tree ? allItems.filter((item) => matchesTree(item.facets, tree.root, shelfDay)) : [];
		}
		if (!collectionId) return allItems;
		const members = new Set(membersQuery.data ?? []);
		return allItems.filter((item) => item.kind === "book" && members.has(item.book.id));
	}, [allItems, collectionId, membersQuery.data, activeShelf, shelfDay]);
	const visibleItems = useMemo(
		() =>
			applyLibraryView(scopedItems, {
				filter: activeFilter,
				sortBy,
				thenBy: sort.thenBy,
				reversed: sort.reversed,
				thenReversed: sort.thenReversed,
				search: searchTextOf(search),
			}),
		[scopedItems, activeFilter, sortBy, sort.thenBy, sort.reversed, sort.thenReversed, search],
	);
	const seriesMemberships = seriesMembershipsQuery.data ?? NO_SERIES_MEMBERSHIPS;
	const groups = useMemo(
		() =>
			groupLibrary(visibleItems, groupBy, {
				collections: collectionsQuery.data ?? [],
				seriesMemberships,
			}),
		[visibleItems, groupBy, collectionsQuery.data, seriesMemberships],
	);
	const filterCount = activeFilterCount(activeFilter);
	const canSaveFilter = canSaveAsShelf(activeFilter);
	const shelfIsEdited =
		!!activeShelf?.filter &&
		serializeTree(filterToTree(activeFilter)) !== serializeTree(filterToTree(activeShelf.filter));
	const isNarrowed = filterCount > 0 || searchTextOf(search).trim() !== "";
	const isCollectionEmpty = !!collectionId && membersQuery.isSuccess && scopedItems.length === 0;
	const shownItems = useMemo(
		() => displayOrder(visibleItems, groups, collapsedGroups),
		[visibleItems, groups, collapsedGroups],
	);
	const selection = useLibrarySelection(books, shownItems);
	const cellContext = useMemo<CellContext>(
		() => ({
			seriesMemberships,
			collections: collectionsById,
		}),
		[seriesMemberships, collectionsById],
	);
	const gridRef = useRef<HTMLDivElement>(null);
	useDragSelect(gridRef, {
		isActive: selection.drag.isActive,
		onOver: selection.drag.over,
		onEnd: selection.drag.end,
	});

	const searchInputRef = useRef<HTMLInputElement>(null);
	// The phone keyboard is up while the search has focus; the tab bar would ride on it.
	// Selection owns the flag while its bar is shown.
	const isTypingSearch = isSearchOpen && isSearchFocused && !selection.isSelecting;
	useEffect(() => {
		if (!isTypingSearch) return;
		tabBarHidden.set(true);
		return () => tabBarHidden.set(false);
	}, [isTypingSearch]);
	const isAddButtonShown =
		!selection.isSelecting && !isOrderedView && !isDesktop && (!!activeCollection || !activeShelf);
	useEffect(() => {
		if (!isAddButtonShown) return;
		addButtonShown.set(true);
		return () => addButtonShown.set(false);
	}, [isAddButtonShown]);
	const [isViewOpen, setViewOpen] = useState(false);
	const [isGroupByKeyed, setGroupByKeyed] = useState(false);
	const isGridShown =
		!isOrderedView && !isCollectionEmpty && !(collectionId && !membersQuery.isSuccess);
	const { focusedKey } = useLibraryKeyboard({
		items: isGridShown ? visibleItems : null,
		groups,
		collapsed: collapsedGroups,
		viewMode: shownView,
		selection,
		search: {
			canSearch: controls.search,
			isActive: controls.search && (isSearchOpen || search !== ""),
			focus: () => {
				setIsSearchOpen(true);
				searchInputRef.current?.focus();
			},
			clear: closeSearch,
		},
		canGroup: controls.view && !isOrderedView,
		openGroupBy: () => {
			setGroupByKeyed(true);
			setViewOpen(true);
		},
		openItem: (item) => {
			if (item.kind === "series") {
				handleOpenSeries(item.series);
				return;
			}
			qc.setQueryData(bookKeys.detail(item.book.id), item.book);
			navigate({ to: "/tabs/reader/$id", params: { id: item.book.id } });
		},
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

	const renderCard = (
		item: LibraryItem,
		surface: CardSurface,
		fields: readonly CardFieldId[],
		ordered?: OrderedCardOptions,
	) => {
		if (item.kind === "series") {
			const s = item.series;
			const Item = surface === "grid" ? SeriesCard : SeriesListItem;
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
						chapterLengths={seriesLengths.get(s.id)}
						onOpen={() => handleOpenSeries(s)}
						onMenu={() => setSelectedSeries(s)}
						fields={fields}
					/>
				</div>
			);
		}
		const { book } = item;
		const Item = surface === "grid" ? BookCard : BookListItem;
		return (
			<Item
				book={book}
				cover={covers.get(book.id)}
				status={cardStatus(book, item.sortKey.minutesLeft)}
				selectable={selection.isSelecting}
				selected={selection.isSelected(book.id)}
				onToggle={() => selection.toggle(book.id)}
				// A series has no selection: a long press opens its Move up / down menu.
				onModifiedClick={
					ordered
						? undefined
						: (e) => (e.shiftKey ? selection.selectRange(book.id) : selection.toggle(book.id))
				}
				onLongPress={ordered ? undefined : () => selection.drag.start(book.id)}
				onOpen={() => openBook(book)}
				onMenu={ordered ? ordered.onMenu : () => openBookMenu(book)}
				draggable={canDragBooks}
				seriesNumber={
					ordered
						? ordered.seriesNumber
						: fields.includes("series")
							? seriesBadge(book.id, seriesMemberships)
							: null
				}
				fields={fields}
				values={cardFieldValues(item, cellContext, fields)}
			/>
		);
	};

	const cardSurface: CardSurface = shownView === "list" ? "list" : "grid";
	const renderItem = (item: LibraryItem) =>
		renderCard(item, cardSurface, cardFields.settings[cardSurface]);
	const previewItem =
		shownItems.find((i) => i.kind === "book" && i.sortKey.progress > 0) ??
		shownItems.find((i) => i.kind === "book") ??
		null;
	const renderCardPreview = (surface: CardSurface, fields: readonly CardFieldId[]) =>
		previewItem && renderCard(previewItem, surface, fields);

	const handleBookDragStart = (e: React.DragEvent) => {
		const bookId = (e.target as Element).closest<HTMLElement>("[data-book-id]")?.dataset.bookId;
		if (!bookId) return;
		const ids = selection.isSelected(bookId) ? selection.picked.map((b) => b.id) : [bookId];
		setBooksDragData(e.dataTransfer, ids);
	};

	const isSubPage = !!activeCollection || !!activeShelf;
	const notice = libraryNotice({
		isSubPage,
		isWebBuild: IS_WEB_BUILD,
		isWeb: IS_WEB,
		isLoggedIn,
		isLocalNoticeDismissed: noticeDismissed,
	});
	const filterLabel = filterCount > 0 ? `Filter, ${filterCount} active` : "Filter";
	const filterButton = (
		<Button
			variant="ghost"
			size={isDesktop ? "sm" : "icon"}
			aria-label={filterLabel}
			title="Filter"
			className="relative"
			onClick={isDesktop ? undefined : () => setIsFilterOpen(true)}
		>
			<FilterIcon />
			{isDesktop && "Filter"}
			{filterCount > 0 && (
				<span
					aria-hidden
					className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-primary px-1 font-semibold text-[10px] text-primary-foreground leading-4"
				>
					{filterCount}
				</span>
			)}
		</Button>
	);
	const hasToolbar = controls.search || controls.filter || controls.sort || controls.view;
	const toolbar = hasToolbar && !isCollectionEmpty && (
		<PageContainer
			width="grid"
			role="toolbar"
			aria-label="Library view"
			className="flex flex-wrap items-center gap-2 px-4 pt-2"
		>
			{controls.search ? (
				// Takes its own row once a large system text size leaves it less than ~10 characters.
				<div
					className="min-w-0 flex-1 basis-[10em] md:max-w-md"
					// Only the input counts: the syntax help popover takes focus without a keyboard.
					onFocus={(e) => {
						if (e.target !== searchInputRef.current) return;
						setIsSearchOpen(true);
						setSearchFocused(true);
					}}
					onBlur={(e) => {
						if (e.target !== searchInputRef.current) return;
						setSearchFocused(false);
						// An empty search left behind must not swallow the next back or Escape.
						if (search === "") setIsSearchOpen(false);
					}}
				>
					<SearchAutocomplete
						value={search}
						onValueChange={setSearch}
						filter={activeFilter}
						onFilterChange={setFilter}
						options={options}
						inputRef={searchInputRef}
						onEscape={closeSearch}
					/>
				</div>
			) : (
				<div className="flex-1" />
			)}
			<div className="ml-auto flex shrink-0 items-center gap-1 md:gap-2">
				{controls.filter &&
					(isDesktop ? (
						<FilterPopover
							open={isFilterOpen}
							onOpenChange={setIsFilterOpen}
							filter={activeFilter}
							onChange={setFilter}
							options={options}
							resultCount={visibleItems.length}
							trigger={filterButton}
						/>
					) : (
						filterButton
					))}
				{controls.sort && (
					<SortPopover
						trigger={
							<Button
								variant="ghost"
								size={isDesktop ? "sm" : "icon"}
								aria-label="Sort"
								title="Sort"
							>
								<ArrowUpDown />
								{isDesktop && "Sort"}
							</Button>
						}
						sortBy={shownSort.sortBy}
						onSort={(s) => setSort({ sortBy: s, reversed: false })}
						reversed={shownSort.reversed}
						hasSeriesOrder={isOrderedView}
						onReversed={(r) => setSort({ reversed: r })}
						thenBy={sort.thenBy ?? "none"}
						onThenBy={(t) => setSort({ thenBy: t === "none" ? null : t, thenReversed: false })}
					/>
				)}
				{controls.view && (
					<ViewSheet
						isDesktop={isDesktop}
						view={shownView}
						onView={setViewMode}
						canTable={canTable}
						canGroup={!isOrderedView}
						cardFields={{
							settings: cardFields.settings,
							onToggle: cardFields.toggle,
							renderPreview: renderCardPreview,
						}}
						columns={{
							ids: columnIds,
							onToggle: libraryView.toggleColumn,
							onMove: libraryView.moveColumn,
						}}
						groupBy={groupBy}
						onGroupBy={setGroupBy}
						open={isViewOpen}
						onOpenChange={(open) => {
							setViewOpen(open);
							if (!open) setGroupByKeyed(false);
						}}
						focusGroupBy={isGroupByKeyed}
					/>
				)}
			</div>
		</PageContainer>
	);
	const addLabel = collectionId ? "Add books" : "Add book";
	const headerActions = (
		<>
			{!isOrderedView && !isEmptyLibrary && !isCollectionEmpty && !selection.isSelecting && (
				<Button
					variant="ghost"
					size={isDesktop ? "sm" : "icon"}
					aria-label="Select books"
					title="Select books"
					onClick={selection.start}
				>
					<SquareCheck />
					{isDesktop && "Select"}
				</Button>
			)}
			{isDesktop && !selection.isSelecting && (activeCollection || !activeShelf) && (
				<Button
					size="sm"
					onClick={collectionId ? openAddBooks : () => setImportSheetOpen(true)}
					disabled={imports.isImporting || isTransferring}
					title={collectionId ? addLabel : withKey(addLabel, importKey)}
				>
					{imports.isImporting ? <Loader2 className="animate-spin" /> : <Plus />}
					{addLabel}
				</Button>
			)}
		</>
	);

	// Beside the title on wider screens; on a phone the header row has no room, so it drops below.
	const updateShelfButton = (className?: string) =>
		activeShelf && (
			<UpdateShelfAction
				className={className}
				canSave={canSaveFilter}
				isPending={updateShelf.isPending}
				onUpdate={() =>
					updateShelf.mutate({
						id: activeShelf.id,
						conditions: serializeTree(filterToTree(activeFilter)),
					})
				}
			/>
		);

	return (
		// The grid's virtualizer observes this root for header changes, so the
		// drag handler lives here rather than on a wrapper around the grid.
		<div className="bg-background" onDragStart={canDragBooks ? handleBookDragStart : undefined}>
			{activeCollection ? (
				<PageHeader
					title={activeCollection.name}
					width="grid"
					backTo="/tabs/library"
					right={
						<div className="flex shrink-0 items-center gap-3">
							{!activeCollection.ordered && <SubPageCount count={activeCollection.bookCount} />}
							{headerActions}
							{!isDesktop && activeCollection.ordered && (
								<Button variant="ghost" size="icon" aria-label="Add books" onClick={openAddBooks}>
									<Plus />
								</Button>
							)}
							<CollectionMenuButton
								collection={activeCollection}
								allCollections={collectionsQuery.data ?? []}
							/>
						</div>
					}
				/>
			) : activeShelf ? (
				<>
					<PageHeader
						title={activeShelf.name}
						width="grid"
						backTo="/tabs/library"
						right={
							<div className="flex shrink-0 items-center gap-3" data-testid="smart-shelf-header">
								<SubPageCount count={smart.counts.get(activeShelf.id) ?? 0} />
								{!activeShelf.isBuiltIn && shelfIsEdited && updateShelfButton("max-sm:hidden")}
								{headerActions}
								<Button
									variant="ghost"
									size="icon"
									aria-label={`${activeShelf.name} options`}
									onClick={() => setShelfMenuFor(activeShelf)}
								>
									<MoreHorizontal />
								</Button>
							</div>
						}
					/>
					{!activeShelf.isBuiltIn && shelfIsEdited && (
						<div className="flex justify-end px-4 pt-2 sm:hidden">{updateShelfButton()}</div>
					)}
				</>
			) : (
				<TabHeader
					width="grid"
					icon={LibraryIcon}
					title="Library"
					right={
						// 12px apart, so each icon's 44px hit area stays whole between its neighbours.
						<div className="flex items-center gap-3">
							<HeaderGoalRing />
							{headerActions}
							{!IS_WEB && <BLEIndicator />}
							{showSync && (
								<Button
									variant="ghost"
									size="icon"
									disabled={isSyncing || isTransferring}
									onClick={handleRefresh}
									aria-label="Sync"
									title="Sync"
								>
									{isSyncing ? <Loader2 className="animate-spin" /> : <RefreshCcw />}
								</Button>
							)}
						</div>
					}
				/>
			)}

			{selection.isSelecting && <BulkActionBar selection={selection} />}

			{toolbar}

			{(books.length > 0 || (collectionsQuery.data?.length ?? 0) > 0) && (
				<CollectionShelfRow activeId={collectionId} activeShelfId={shelfId} />
			)}

			<ShelfActions
				shelf={shelfMenuFor}
				onClose={() => setShelfMenuFor(null)}
				setBuiltInPinned={smart.setBuiltInPinned}
			/>
			<SaveShelfDialog open={isSavingShelf} onOpenChange={setIsSavingShelf} filter={activeFilter} />
			{activeShelf && !activeShelf.isBuiltIn && (
				<ShelfConditionEditor
					open={isEditingShelf}
					onOpenChange={setIsEditingShelf}
					shelf={activeShelf}
					// A chip shelf opens on its chips as they stand, edits included.
					initialTree={activeShelf.filter ? filterToTree(activeFilter) : undefined}
				/>
			)}

			{!isCollectionEmpty && (books.length > 0 || series.length > 0) && (
				<FilterBar
					filter={activeFilter}
					onChange={setFilter}
					options={options}
					onSaveShelf={
						canSaveFilter && (!activeShelf || shelfIsEdited)
							? () => setIsSavingShelf(true)
							: undefined
					}
					shelfConditions={
						activeShelf && !activeShelf.isBuiltIn && activeShelf.tree
							? { isCustom: !activeShelf.filter, onEdit: () => setIsEditingShelf(true) }
							: undefined
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

			{notice === "local-storage" && (
				<NoticeBar onDismiss={dismissNotice}>
					Your books are stored locally in this browser only and will be lost if you clear browser
					data.{" "}
					<Link
						to="/tabs/settings/sync"
						className="relative font-medium text-primary underline-offset-4 before:absolute before:-inset-x-1 before:-inset-y-3 before:content-[''] hover:underline"
					>
						Sign in
					</Link>{" "}
					to keep them safe across devices.
				</NoticeBar>
			)}
			{notice === "web-limits" && <WebLimitsLine />}

			{activeCollection?.ordered ? (
				<OrderedCollectionView
					collection={activeCollection}
					items={allItems}
					viewMode={shownView === "list" ? "list" : "grid"}
					renderCard={(item, ordered) =>
						renderCard(item, cardSurface, cardFields.settings[cardSurface], ordered)
					}
					onOpenBook={openBook}
					onAddBooks={openAddBooks}
					canDrag={canDragBooks}
					view={{
						matches: visibleItems,
						inSeriesOrder: isInSeriesOrder,
						reversed: shownSort.reversed,
						onClearNarrowing: () => {
							setFilter({});
							closeSearch();
						},
					}}
				/>
			) : isCollectionEmpty ? (
				<EmptyState
					icon={BookOpen}
					title="No books in this collection yet"
					page
					action={
						<>
							<Button onClick={openAddBooks}>
								<Plus className="size-4" />
								Add books
							</Button>
							<Button
								variant="ghost"
								onClick={() => setImportSheetOpen(true)}
								disabled={imports.isImporting || isTransferring}
							>
								Import files
							</Button>
						</>
					}
				>
					Pick books you already have, or import new ones straight into it.
				</EmptyState>
			) : books.length === 0 && series.length === 0 ? (
				<EmptyState
					icon={BookOpen}
					title="No books yet"
					page
					action={
						<>
							{/* Outline: the header's Add book (the FAB on a phone) is the page's one primary action. */}
							<Button
								variant="outline"
								onClick={() => setImportSheetOpen(true)}
								disabled={imports.isImporting || isTransferring}
							>
								<Plus className="size-4" />
								Import books
							</Button>
							<Button variant="ghost" onClick={() => navigate({ to: "/tabs/explore" })}>
								<Compass className="size-4" />
								Find free books in Explore
							</Button>
							{isGlobalImporting && (
								<p className="m-0 text-muted-foreground text-sm">Importing...</p>
							)}
						</>
					}
				>
					Import a file, a web link or pasted text, or pick a free book in Explore.
				</EmptyState>
			) : visibleItems.length === 0 ? (
				collectionId && !membersQuery.isSuccess ? null : (
					<EmptyState
						icon={isNarrowed ? SearchX : BookOpen}
						title={isNarrowed ? "No books match" : "Nothing to show"}
						page
						action={
							isNarrowed &&
							!activeShelf && (
								<Button
									variant="outline"
									onClick={() => {
										setFilter({});
										closeSearch();
									}}
								>
									Clear search and filters
								</Button>
							)
						}
					>
						{isNarrowed &&
							(activeShelf
								? "No book fits this shelf's rules yet."
								: "Try another search, or clear the filters.")}
					</EmptyState>
				)
			) : shownView === "table" ? (
				<LibraryTable
					items={visibleItems}
					groups={groups}
					collapsed={collapsedGroups}
					onToggleGroup={toggleGroup}
					columns={tableColumns}
					ctx={cellContext}
					sort={sort}
					onHeaderSort={(key, shift) => setSort(headerSort(sort, key, shift))}
					onMoveColumn={libraryView.moveColumn}
					onEditBook={editBook}
					libraryTags={availableTags}
					selection={selection}
					onOpenBook={openBook}
					onOpenSeries={handleOpenSeries}
					onBookMenu={openBookMenu}
					onSeriesMenu={setSelectedSeries}
					draggable={canDragBooks}
					containerRef={gridRef}
					focusedKey={focusedKey}
				/>
			) : (
				<VirtualBookGrid
					items={visibleItems}
					viewMode={shownView}
					renderItem={renderItem}
					containerRef={gridRef}
					onBackgroundTap={selection.isSelecting ? selection.exit : undefined}
					groups={groups}
					collapsed={collapsedGroups}
					onToggleGroup={toggleGroup}
					focusedKey={focusedKey}
				/>
			)}

			{/* Hidden while selecting: it would sit under the selection UI, and
			    suppressing new imports mid-selection is a welcome side effect. */}
			<button
				type="button"
				hidden={!isAddButtonShown}
				onClick={collectionId ? openAddBooks : () => setImportSheetOpen(true)}
				disabled={imports.isImporting || isTransferring}
				aria-label={collectionId ? "Add books" : "Add book"}
				data-toast-clear
				title={collectionId ? "Add books" : withKey("Add book", importKey)}
				className="fixed right-4 z-30 inline-flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95 disabled:pointer-events-none disabled:opacity-50 md:hidden"
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
					targetCollectionId={collectionId}
				/>
			)}

			<PasteUrlModal
				isOpen={urlModalOpen}
				isImporting={imports.isUrlImporting}
				error={imports.urlError}
				onClearError={imports.clearUrlError}
				onClose={() => setUrlModalOpen(false)}
				onSubmit={handleImportUrl}
			/>

			<PasteTextModal
				isOpen={imports.pasteTextOpen}
				isImporting={imports.isImporting}
				onClose={imports.closePasteText}
				onSubmit={imports.importFromText}
			/>

			{bookActions.overlays}

			<BulkSheets selection={selection} libraryTags={availableTags} />

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
				title="Import failed"
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

const SubPageCount: React.FC<{ count: number }> = ({ count }) => (
	<span className="text-muted-foreground text-sm tabular-nums max-sm:hidden">{count}</span>
);
