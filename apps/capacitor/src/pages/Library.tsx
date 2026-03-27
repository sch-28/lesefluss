import {
	IonAlert,
	IonContent,
	IonFab,
	IonFabButton,
	IonIcon,
	IonPage,
	IonProgressBar,
	IonSpinner,
	IonText,
} from "@ionic/react";
import { add, bookOutline } from "ionicons/icons";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
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

const LONG_PRESS_MS = 500;

const Library: React.FC = () => {
	const { isReady } = useDatabase();
	const [books, setBooks] = useState<Book[]>([]);
	const [covers, setCovers] = useState<Map<number, string>>(new Map());
	const [loading, setLoading] = useState(true);
	const [importing, setImporting] = useState(false);
	const [importProgress, setImportProgress] = useState(0);
	const [importError, setImportError] = useState<string | null>(null);
	const [bookToDelete, setBookToDelete] = useState<Book | null>(null);

	// Long-press tracking
	const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const longPressFired = useRef(false);

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

	const handleDeleteConfirm = async () => {
		if (!bookToDelete) return;
		try {
			await removeBook(bookToDelete);
			setBooks((prev) => prev.filter((b) => b.id !== bookToDelete.id));
		} catch (err) {
			console.error("Failed to delete book:", err);
		} finally {
			setBookToDelete(null);
		}
	};

	// Long press handlers
	const startLongPress = (book: Book) => {
		longPressFired.current = false;
		longPressTimer.current = setTimeout(() => {
			longPressFired.current = true;
			setBookToDelete(book);
		}, LONG_PRESS_MS);
	};

	const cancelLongPress = () => {
		if (longPressTimer.current) {
			clearTimeout(longPressTimer.current);
			longPressTimer.current = null;
		}
	};

	const handleTap = (_book: Book) => {
		if (longPressFired.current) return;
		// Future: navigate to reader
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

							return (
								<div
									key={book.id}
									className="flex cursor-pointer select-none flex-col active:opacity-70"
									style={{ WebkitTouchCallout: "none" }}
									onPointerDown={() => startLongPress(book)}
									onPointerUp={cancelLongPress}
									onPointerLeave={cancelLongPress}
									onPointerCancel={cancelLongPress}
									onClick={() => handleTap(book)}
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

										{/* Slot badge overlay */}
										{book.slot != null && (
											<span className="absolute right-1.5 bottom-1.5 rounded-sm bg-black px-1.5 py-0.5 font-semibold text-[0.6rem] text-white">
												Slot {book.slot}
											</span>
										)}
									</div>

									{/* Progress + meta row */}
									<div className="mt-1 flex items-center gap-1.5">
										{!started && (
											<>
												<div className="flex-1 [--buffer-background:#e0e0e0] [--progress-background:#000]">
													<IonProgressBar value={progress / 100} />
												</div>
												<span className="font-medium text-[#888] text-[0.7rem]">{progress}%</span>
											</>
										)}
									</div>
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
					<IonFabButton onClick={handleImport} disabled={importing}>
						{importing ? <IonSpinner name="crescent" /> : <IonIcon icon={add} />}
					</IonFabButton>
				</IonFab>

				{/* Delete confirmation */}
				<IonAlert
					isOpen={!!bookToDelete}
					onDidDismiss={() => setBookToDelete(null)}
					header="Delete Book"
					message={`Remove "${bookToDelete?.title}" from your library?`}
					buttons={[
						{ text: "Cancel", role: "cancel" },
						{
							text: "Delete",
							role: "confirm",
							handler: handleDeleteConfirm,
						},
					]}
				/>

				{/* Import error alert */}
				<IonAlert
					isOpen={!!importError}
					onDidDismiss={() => setImportError(null)}
					header="Import Failed"
					message={importError || ""}
					buttons={["OK"]}
				/>
			</IonContent>
		</IonPage>
	);
};

export default Library;
