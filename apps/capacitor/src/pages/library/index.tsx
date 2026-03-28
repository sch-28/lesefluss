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
import { add, bookOutline, refreshOutline } from "ionicons/icons";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useBLE } from "../../contexts/BLEContext";
import { useBookSync } from "../../contexts/BookSyncContext";
import { useDatabase } from "../../contexts/DatabaseContext";
import { queries } from "../../db/queries";
import type { Book } from "../../db/schema";
import { importBook, removeBook } from "../../services/bookImport";
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
	const { isReady } = useDatabase();
	const { isConnected } = useBLE();
	const {
		activeBookId,
		isTransferring,
		syncPosition,
		error: syncError,
		clearError,
	} = useBookSync();
	const router = useIonRouter();

	const [books, setBooks] = useState<Book[]>([]);
	const [covers, setCovers] = useState<Map<string, string>>(new Map());
	const [loading, setLoading] = useState(true);
	const [syncing, setSyncing] = useState(false);
	const [importing, setImporting] = useState(false);
	const [importProgress, setImportProgress] = useState(0);
	const [importError, setImportError] = useState<string | null>(null);

	// Action sheet state
	const [selectedBook, setSelectedBook] = useState<Book | null>(null);

	// Transfer confirmation + progress modal state
	const [pendingTransferBook, setPendingTransferBook] = useState<Book | null>(null);

	// Delete confirmation state
	const [pendingDeleteBook, setPendingDeleteBook] = useState<Book | null>(null);

	const loadBooks = useCallback(async () => {
		try {
			const [rows, coverMap] = await Promise.all([queries.getBooks(), queries.getBookCovers()]);
			setBooks(rows);
			setCovers(coverMap);
		} catch (err) {
			console.error("Failed to load books:", err);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		if (isReady) {
			loadBooks();
		}
	}, [isReady, loadBooks]);

	// Reload when navigating back (e.g. from reader) so progress bars update
	useIonViewWillEnter(() => {
		if (isReady) {
			loadBooks();
		}
	});

	// Reload list after a transfer completes so "On device" badge updates
	useEffect(() => {
		if (!isTransferring && isReady) {
			loadBooks();
		}
	}, [isTransferring, isReady, loadBooks]);

	const handleImport = async () => {
		setImporting(true);
		setImportProgress(0);
		setImportError(null);

		try {
			await importBook((pct: number) => setImportProgress(pct));
			await loadBooks();
		} catch (err: unknown) {
			if (err instanceof Error && err.message !== "CANCELLED") {
				console.error("Import failed:", err);
				setImportError(err.message || "Import failed");
			}
		} finally {
			setImporting(false);
			setImportProgress(0);
		}
	};

	const handleRefresh = async () => {
		setSyncing(true);
		try {
			await syncPosition();
			await loadBooks();
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

	const handleDeleteConfirm = async () => {
		if (!pendingDeleteBook) return;
		const book = pendingDeleteBook;
		setPendingDeleteBook(null);
		try {
			await removeBook(book);
			setBooks((prev) => prev.filter((b) => b.id !== book.id));
		} catch (err) {
			console.error("Failed to delete book:", err);
		}
	};

	const handleTransferDismiss = () => {
		setPendingTransferBook(null);
		// Reload so the "On device" badge updates immediately after the modal closes
		if (isReady) loadBooks();
	};

	if (loading) {
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
				{importing && (
					<IonProgressBar
						value={importProgress / 100}
						type={importProgress === 0 ? "indeterminate" : "determinate"}
					/>
				)}

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
					onDidDismiss={() => setImportError(null)}
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
