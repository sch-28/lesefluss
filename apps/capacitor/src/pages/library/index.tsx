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
	IonTitle,
	IonToolbar,
	useIonRouter,
	useIonViewWillEnter,
} from "@ionic/react";
import { useQueryClient } from "@tanstack/react-query";
import { add, bookOutline, refreshOutline } from "ionicons/icons";
import type React from "react";
import { useEffect, useState } from "react";
import { useBLE } from "../../contexts/ble-context";
import { useBookSync } from "../../contexts/book-sync-context";
import { queryHooks } from "../../services/db/hooks";
import { bookKeys } from "../../services/db/hooks/query-keys";
import type { Book } from "../../services/db/schema";
import { log } from "../../utils/log";
import BookCard from "./book-card";
import TransferModal from "./transfer-modal";

/**
 * Reading progress percentage for a book.
 */
function readingProgress(book: Book): number {
	if (!book.size || book.size === 0) return 0;
	return Math.min(100, Math.round((book.position / book.size) * 100));
}

const Library: React.FC = () => {
	const { isConnected } = useBLE();
	const {
		activeBookId,
		isTransferring,
		syncPosition,
		error: syncError,
		clearError,
	} = useBookSync();
	const router = useIonRouter();
	const qc = useQueryClient();

	// ── Data queries ─────────────────────────────────────────────────────
	const { data, isPending } = queryHooks.useBooks();
	const books = data?.books ?? [];
	const covers = data?.covers ?? new Map<string, string>();

	// ── Mutations ────────────────────────────────────────────────────────
	const importMutation = queryHooks.useImportBook();
	const deleteMutation = queryHooks.useDeleteBook();

	// ── Local UI state ───────────────────────────────────────────────────
	const [syncing, setSyncing] = useState(false);
	const [importProgress, setImportProgress] = useState(0);

	// Action sheet state
	const [selectedBook, setSelectedBook] = useState<Book | null>(null);

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

	const handleImport = () => {
		setImportProgress(0);
		importMutation.mutate(
			{ onProgress: (pct: number) => setImportProgress(pct) },
			{ onSettled: () => setImportProgress(0) },
		);
	};

	const handleRefresh = async () => {
		setSyncing(true);
		try {
			await syncPosition();
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

	// ── Import error: ignore "CANCELLED" (user dismissed the file picker) ──
	const importError =
		importMutation.error instanceof Error && importMutation.error.message !== "CANCELLED"
			? importMutation.error.message
			: null;

	const importing = importMutation.isPending;

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
					<IonTitle>Library</IonTitle>
					<IonButtons slot="end">
						<IonButton
							disabled={!isConnected || syncing || isTransferring}
							onClick={handleRefresh}
							title="Sync position from device"
						>
							{syncing ? (
								<IonSpinner name="crescent" slot="icon-only" />
							) : (
								<IonIcon slot="icon-only" icon={refreshOutline} />
							)}
						</IonButton>
					</IonButtons>
				</IonToolbar>
			</IonHeader>
			<IonContent>
				{/* Import progress bar */}
				{importing && <IonProgressBar value={importProgress / 100} type={"determinate"} />}

				{books.length === 0 ? (
					/* ── Empty state ── */
					<div className="flex h-full flex-col items-center justify-center p-8 text-center">
						<IonIcon icon={bookOutline} className="mb-4 text-6xl text-[#ccc]" />
						<IonText color="medium">
							<h2 style={{ margin: "0 0 0.5rem" }}>No books yet</h2>
							<p style={{ margin: 0 }}>Tap the + button to import a TXT or EPUB file.</p>
						</IonText>
						{importing && (
							<IonText color="medium" style={{ marginTop: "1rem" }}>
								<p>Importing...</p>
							</IonText>
						)}
					</div>
				) : (
					/* ── Book grid ── */
					<div className="grid grid-cols-3 gap-4 p-4 pb-20">
						{books.map((book) => {
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
									onOpen={() => router.push(`/tabs/reader/${book.id}`)}
									onMenu={() => setSelectedBook(book)}
								/>
							);
						})}
					</div>
				)}

				{/* FAB: import button */}
				<IonFab vertical="bottom" horizontal="end" slot="fixed">
					<IonFabButton onClick={handleImport} disabled={importing || isTransferring}>
						{importing ? <IonSpinner name="crescent" /> : <IonIcon icon={add} />}
					</IonFabButton>
				</IonFab>

				{/* Book action sheet */}
				<IonActionSheet
					isOpen={!!selectedBook}
					onDidDismiss={() => setSelectedBook(null)}
					header={selectedBook?.title}
					cssClass="rsvp-action-sheet"
					buttons={[
						{
							text: isConnected ? "Set active on device" : "Set active on device (not connected)",
							disabled: !isConnected || isTransferring,
							handler: () => {
								if (selectedBook) handleSetActive(selectedBook);
							},
						},
						{
							text: "Delete",
							role: "destructive",
							handler: () => {
								if (selectedBook) handleDelete(selectedBook);
							},
						},
						{
							text: "Cancel",
							role: "cancel",
						},
					]}
				/>

				{/* Transfer confirm + progress modal (self-contained) */}
				<TransferModal
					isOpen={!!pendingTransferBook}
					book={pendingTransferBook}
					activeBook={books.find((b) => b.id === activeBookId) ?? null}
					onDismiss={handleTransferDismiss}
				/>

				{/* Import error alert */}
				<IonAlert
					isOpen={!!importError}
					onDidDismiss={() => importMutation.reset()}
					header="Import Failed"
					message={importError ?? undefined}
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
