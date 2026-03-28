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
	IonModal,
	IonPage,
	IonProgressBar,
	IonSpinner,
	IonText,
	IonTitle,
	IonToolbar,
} from "@ionic/react";
import { add, bookOutline, refreshOutline } from "ionicons/icons";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useBLE } from "../contexts/BLEContext";
import { useBookSync } from "../contexts/BookSyncContext";
import { useDatabase } from "../contexts/DatabaseContext";
import { queries } from "../db/queries";
import type { Book } from "../db/schema";
import { importBook, removeBook } from "../services/bookImport";

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
		transferProgress,
		transferBook,
		syncPosition,
		error: syncError,
		clearError,
	} = useBookSync();

	const [books, setBooks] = useState<Book[]>([]);
	const [covers, setCovers] = useState<Map<number, string>>(new Map());
	const [loading, setLoading] = useState(true);
	const [syncing, setSyncing] = useState(false);
	const [importing, setImporting] = useState(false);
	const [importProgress, setImportProgress] = useState(0);
	const [importError, setImportError] = useState<string | null>(null);

	// Action sheet state
	const [selectedBook, setSelectedBook] = useState<Book | null>(null);

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

	const handleSetActive = async (book: Book) => {
		setSelectedBook(null);
		await transferBook(book.id, () => {});
	};

	const handleDelete = async (book: Book) => {
		setSelectedBook(null);
		try {
			await removeBook(book);
			setBooks((prev) => prev.filter((b) => b.id !== book.id));
		} catch (err) {
			console.error("Failed to delete book:", err);
		}
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
								<div
									key={book.id}
									className="flex cursor-pointer select-none flex-col active:opacity-70"
									style={{ WebkitTouchCallout: "none" }}
									onClick={() => setSelectedBook(book)}
								>
									{/* Cover */}
									<div className="relative aspect-2/3 w-full overflow-hidden rounded-sm border border-[#d9d9d9] bg-[#f0f0f0]">
										{cover ? (
											<img
												src={cover}
												alt={book.title}
												className="block h-full w-full object-cover"
											/>
										) : (
											<div className="flex h-full flex-col items-center justify-center gap-2 text-[#aaa]">
												<IonIcon icon={bookOutline} className="text-[2.5rem]" />
												<span className="font-semibold text-[#bbb] text-[0.65rem] tracking-[0.05em]">
													{book.fileFormat.toUpperCase()}
												</span>
											</div>
										)}

										{/* "On device" badge overlay */}
										{isActive && (
											<span className="absolute right-1.5 bottom-1.5 rounded-sm bg-black px-1.5 py-0.5 font-semibold text-[0.6rem] text-white">
												On device
											</span>
										)}
									</div>

									{/* Progress bar */}
									{started && (
										<div className="mt-1 flex items-center gap-1.5">
											<div className="flex-1 [--buffer-background:#e0e0e0] [--progress-background:#000]">
												<IonProgressBar value={progress / 100} />
											</div>
											<span className="font-medium text-[#888] text-[0.7rem]">{progress}%</span>
										</div>
									)}

									{/* Info below cover */}
									<div className="px-0.5 pt-1">
										<div className="overflow-hidden text-ellipsis font-semibold text-[0.85rem] leading-[1.2] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [display:-webkit-box]">
											{book.title}
										</div>
										{book.author && (
											<div className="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-[#888] text-[0.75rem]">
												{book.author}
											</div>
										)}
									</div>
								</div>
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

				{/* Transfer progress modal */}
				<IonModal isOpen={isTransferring} backdropDismiss={false} className="rsvp-transfer-modal">
					<div className="flex flex-col items-center gap-4 p-8">
						<IonText>
							<h3 style={{ margin: 0 }}>Uploading to device</h3>
						</IonText>
						<IonProgressBar
							value={transferProgress != null ? transferProgress / 100 : 0}
							type={
								transferProgress == null || transferProgress === 0 ? "indeterminate" : "determinate"
							}
							style={{ width: "100%" }}
						/>
						{transferProgress != null && (
							<IonText color="medium">
								<p style={{ margin: 0 }}>{transferProgress}%</p>
							</IonText>
						)}
					</div>
				</IonModal>

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
			</IonContent>
		</IonPage>
	);
};

export default Library;
