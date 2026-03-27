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
import "./Library.css";

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
			const [rows, coverMap] = await Promise.all([
				queries.getBooks(),
				queries.getBookCovers(),
			]);
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
					<div className="library-center">
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
					<div className="library-center library-empty">
						<IonIcon icon={bookOutline} className="library-empty-icon" />
						<IonText color="medium">
							<h2 style={{ margin: "0 0 0.5rem" }}>No books yet</h2>
							<p style={{ margin: 0 }}>
								Tap the + button to import a TXT or EPUB file.
							</p>
						</IonText>
						{importing && (
							<IonText color="medium" style={{ marginTop: "1rem" }}>
								<p>Importing...</p>
							</IonText>
						)}
					</div>
				) : (
					/* ── Book grid ── */
					<div className="library-grid">
						{books.map((book) => {
							const progress = readingProgress(book);
							const started = book.position > 0;
							const cover = covers.get(book.id);

							return (
								<div
									key={book.id}
									className="book-card"
									onPointerDown={() => startLongPress(book)}
									onPointerUp={cancelLongPress}
									onPointerLeave={cancelLongPress}
									onPointerCancel={cancelLongPress}
									onClick={() => handleTap(book)}
								>
									{/* Cover */}
									<div className="book-cover">
										{cover ? (
											<img src={cover} alt={book.title} />
										) : (
											<div className="book-cover-placeholder">
												<IonIcon icon={bookOutline} />
												<span className="book-cover-format">
													{book.fileFormat.toUpperCase()}
												</span>
											</div>
										)}

										{/* Slot badge overlay */}
										{book.slot != null && (
											<span className="book-slot-badge">Slot {book.slot}</span>
										)}
									</div>

									{/* Info below cover */}
									<div className="book-info">
										<div className="book-title">{book.title}</div>
										{book.author && (
											<div className="book-author">{book.author}</div>
										)}

										{/* Progress + meta row */}
										<div className="book-meta">
											{started ? (
												<>
													<div className="book-progress-bar">
														<IonProgressBar value={progress / 100} />
													</div>
													<span className="book-progress-text">
														{progress}%
													</span>
												</>
											) : (
												<span className="book-meta-text">New</span>
											)}
										</div>
									</div>
								</div>
							);
						})}
					</div>
				)}

				{/* FAB: import button */}
				<IonFab vertical="bottom" horizontal="end" slot="fixed">
					<IonFabButton onClick={handleImport} disabled={importing}>
						{importing ? (
							<IonSpinner name="crescent" />
						) : (
							<IonIcon icon={add} />
						)}
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
