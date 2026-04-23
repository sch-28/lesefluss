import {
	IonActionSheet,
	IonAlert,
	IonButton,
	IonButtons,
	IonContent,
	IonFab,
	IonFabButton,
	IonHeader,
	IonIcon,
	IonPage,
	IonProgressBar,
	IonSpinner,
	IonText,
	IonToolbar,
	useIonViewWillEnter,
} from "@ionic/react";
import { useQueryClient } from "@tanstack/react-query";
import {
	add,
	bookOutline,
	filterOutline,
	refreshOutline,
	swapVerticalOutline,
} from "ionicons/icons";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useHistory } from "react-router-dom";
import BLEIndicator from "../../components/ble-indicator";
import { useBLE } from "../../contexts/ble-context";
import { useBookSync } from "../../contexts/book-sync-context";
import { useSyncContext } from "../../contexts/sync-context";
import { queryHooks } from "../../services/db/hooks";
import { bookKeys } from "../../services/db/hooks/query-keys";
import type { Book } from "../../services/db/schema";
import { IS_WEB_BUILD } from "../../services/sync";
import { IS_WEB } from "../../utils/platform";
import BookCard from "./book-card";
import FilterPopover from "./filter-popover";
import ImportSheet from "./import-sheet";
import PasteUrlModal from "./paste-url-modal";
import { type FilterBy, filterAndSort, readingProgress, type SortBy } from "./sort-filter";
import SortPopover from "./sort-popover";
import TransferModal from "./transfer-modal";
import { useLibraryImports } from "./use-library-imports";

const LOCAL_NOTICE_KEY = "lesefluss:local-notice-dismissed";

const Library: React.FC = () => {
	const { isConnected } = useBLE();
	const {
		activeBookId,
		isTransferring,
		syncPosition,
		error: syncError,
		clearError,
	} = useBookSync();
	const { isLoggedIn, syncNow } = useSyncContext();
	const history = useHistory();
	const qc = useQueryClient();

	// ── Data queries ─────────────────────────────────────────────────────
	const { data, isPending } = queryHooks.useBooks();
	const books = data?.books ?? [];
	const covers = data?.covers ?? new Map<string, string>();

	// ── Mutations ────────────────────────────────────────────────────────
	const imports = useLibraryImports();
	const deleteMutation = queryHooks.useDeleteBook();

	// ── Local UI state ───────────────────────────────────────────────────
	const [syncing, setSyncing] = useState(false);
	const [noticeDismissed, setNoticeDismissed] = useState(
		() => localStorage.getItem(LOCAL_NOTICE_KEY) === "1",
	);
	const [sortBy, setSortBy] = useState<SortBy>("recent");
	const [filterBy, setFilterBy] = useState<FilterBy>("all");

	// Action sheet state
	const [selectedBook, setSelectedBook] = useState<Book | null>(null);
	const [importSheetOpen, setImportSheetOpen] = useState(false);
	const [urlModalOpen, setUrlModalOpen] = useState(false);

	// Transfer confirmation + progress modal state
	const [pendingTransferBook, setPendingTransferBook] = useState<Book | null>(null);

	// Delete confirmation state
	const [pendingDeleteBook, setPendingDeleteBook] = useState<Book | null>(null);

	// Reload when navigating back (e.g. from reader) so progress bars update
	useIonViewWillEnter(() => {
		qc.invalidateQueries({ queryKey: bookKeys.all });
	});

	// Reload list after a transfer completes so "On device" badge updates
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
		setSyncing(true);
		try {
			await Promise.all([
				isConnected ? syncPosition() : undefined,
				isLoggedIn ? syncNow() : undefined,
			]);
			qc.invalidateQueries({ queryKey: bookKeys.all });
		} finally {
			setSyncing(false);
		}
	};

	const handleSetActive = (book: Book) => {
		setSelectedBook(null);
		setPendingTransferBook(book);
	};

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

	const handleTransferDismiss = () => {
		setPendingTransferBook(null);
		// Invalidate so the "On device" badge updates immediately after the modal closes
		qc.invalidateQueries({ queryKey: bookKeys.all });
	};

	const visible = books.length > 0 ? filterAndSort(books, filterBy, sortBy) : [];

	if (isPending) {
		return (
			<IonPage>
				<IonContent className="ion-padding ion-text-center">
					<div className="flex h-full flex-col items-center justify-center">
						<IonSpinner />
					</div>
				</IonContent>
			</IonPage>
		);
	}

	return (
		<IonPage>
			<IonHeader class="ion-no-border">
				<IonToolbar>
					<div className="library-toolbar">
						<div className="app-brand">
							<img src="/logo.png" alt="" />
							<span>Lesefluss</span>
						</div>
						<IonButtons>
							<IonButton id="filter-trigger" title="Filter">
								<IonIcon slot="icon-only" icon={filterOutline} />
							</IonButton>
							<IonButton id="sort-trigger" title="Sort">
								<IonIcon slot="icon-only" icon={swapVerticalOutline} />
							</IonButton>
							{!IS_WEB && <BLEIndicator />}
							{(isConnected || isLoggedIn) && (
								<IonButton
									disabled={syncing || isTransferring}
									onClick={handleRefresh}
									title="Sync"
								>
									{syncing ? (
										<IonSpinner name="crescent" slot="icon-only" />
									) : (
										<IonIcon slot="icon-only" icon={refreshOutline} />
									)}
								</IonButton>
							)}
						</IonButtons>
					</div>
				</IonToolbar>
			</IonHeader>
			<IonContent>
				{/* Import progress bar */}
				{imports.isImporting && (
					<IonProgressBar value={imports.progress / 100} type={"determinate"} />
				)}

				{/* Local-storage notice for unauthenticated web users */}
				{IS_WEB_BUILD && !isLoggedIn && !noticeDismissed && (
					<div className="local-storage-notice">
						<span className="local-storage-notice__text">
							Your books are stored locally in this browser only and will be lost if you clear
							browser data.{" "}
							<a
								href="/tabs/settings/sync"
								className="local-storage-notice__link"
								onClick={(e) => {
									e.preventDefault();
									history.push("/tabs/settings/sync");
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
							className="local-storage-notice__dismiss"
						>
							✕
						</button>
					</div>
				)}

				{books.length === 0 ? (
					/* ── Empty state ── */
					<div className="flex h-full flex-col items-center justify-center p-8 text-center">
						<IonIcon icon={bookOutline} className="mb-4 text-6xl text-[#ccc]" />
						<IonText color="medium">
							<h2 style={{ margin: "0 0 0.5rem" }}>No books yet</h2>
							<p style={{ margin: 0 }}>Tap the + button to import a file or paste text.</p>
						</IonText>
						{imports.isImporting && (
							<IonText color="medium" style={{ marginTop: "1rem" }}>
								<p>Importing...</p>
							</IonText>
						)}
					</div>
				) : visible.length === 0 ? (
					/* ── Filter empty state ── */
					<div className="flex h-full flex-col items-center justify-center p-8 text-center">
						<IonText color="medium">
							<p style={{ margin: 0 }}>No books match this filter.</p>
						</IonText>
					</div>
				) : (
					/* ── Book grid ── */
					<div className="grid grid-cols-3 gap-4 p-4 pb-20 content-container md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
						{visible.map((book) => {
							const progress = readingProgress(book);
							const started = book.position > 0;
							const cover = covers.get(book.id);
							const isActive = book.id === activeBookId;

							return (
								<BookCard
									key={book.id}
									book={book}
									cover={cover}
									progress={progress}
									started={started}
									isActive={isActive}
									onOpen={() => {
										qc.setQueryData(bookKeys.detail(book.id), book);
										history.push(`/tabs/reader/${book.id}`);
									}}
									onMenu={() => setSelectedBook(book)}
								/>
							);
						})}
					</div>
				)}

				{/* FAB: opens import sources action sheet */}
				<IonFab vertical="bottom" horizontal="end" slot="fixed">
					<IonFabButton
						onClick={() => setImportSheetOpen(true)}
						disabled={imports.isImporting || isTransferring}
					>
						{imports.isImporting ? <IonSpinner name="crescent" /> : <IonIcon icon={add} />}
					</IonFabButton>
				</IonFab>

				<ImportSheet
					isOpen={importSheetOpen}
					onClose={() => setImportSheetOpen(false)}
					onPickFile={imports.importFromFile}
					onPickClipboard={imports.importFromClipboard}
					onPickUrl={() => setUrlModalOpen(true)}
				/>

				{/* Filter + sort popovers */}
				<FilterPopover trigger="filter-trigger" filterBy={filterBy} onFilter={setFilterBy} />
				<SortPopover trigger="sort-trigger" sortBy={sortBy} onSort={setSortBy} />

				<PasteUrlModal
					isOpen={urlModalOpen}
					isImporting={imports.isUrlImporting}
					onClose={() => setUrlModalOpen(false)}
					onSubmit={handleImportUrl}
				/>

				{/* Book action sheet */}
				<IonActionSheet
					isOpen={!!selectedBook}
					onDidDismiss={() => setSelectedBook(null)}
					header={selectedBook?.title}
					cssClass="rsvp-action-sheet"
					buttons={[
						{
							text: "Details",
							handler: () => {
								if (selectedBook) history.push(`/tabs/library/book/${selectedBook.id}`);
							},
						},
						...(!IS_WEB
							? [
									{
										text: isConnected
											? "Set active on device"
											: "Set active on device (not connected)",
										disabled: !isConnected || isTransferring,
										handler: () => {
											if (selectedBook) handleSetActive(selectedBook);
										},
									},
								]
							: []),
						{
							text: "Delete",
							role: "destructive" as const,
							handler: () => {
								if (selectedBook) handleDelete(selectedBook);
							},
						},
						{
							text: "Cancel",
							role: "cancel" as const,
						},
					]}
				/>

				{/* Transfer confirm + progress modal (self-contained, native only) */}
				{!IS_WEB && (
					<TransferModal
						isOpen={!!pendingTransferBook}
						book={pendingTransferBook}
						activeBook={books.find((b) => b.id === activeBookId) ?? null}
						onDismiss={handleTransferDismiss}
					/>
				)}

				{/* Import error alert */}
				<IonAlert
					isOpen={!!imports.errorMessage}
					onDidDismiss={imports.resetError}
					header="Import Failed"
					message={imports.errorMessage ?? undefined}
					buttons={[{ text: "OK", role: "cancel" }]}
					cssClass="rsvp-alert"
				/>

				{/* Transfer error alert */}
				<IonAlert
					isOpen={!!syncError}
					onDidDismiss={clearError}
					header="Transfer Failed"
					message={syncError ?? undefined}
					buttons={[{ text: "OK", role: "cancel" }]}
					cssClass="rsvp-alert"
				/>

				{/* Delete confirmation alert */}
				<IonAlert
					isOpen={!!pendingDeleteBook}
					onDidDismiss={() => setPendingDeleteBook(null)}
					header="Delete book?"
					message={
						pendingDeleteBook
							? `"${pendingDeleteBook.title}" will be removed from your library.`
							: undefined
					}
					buttons={[
						{ text: "Cancel", role: "cancel" },
						{ text: "Delete", role: "destructive", handler: handleDeleteConfirm },
					]}
					cssClass="rsvp-alert"
				/>
			</IonContent>
		</IonPage>
	);
};

export default Library;
