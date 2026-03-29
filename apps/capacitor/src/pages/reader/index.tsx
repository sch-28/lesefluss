/**
 * BookReader — full-screen virtualized scroll reader.
 *
 * Data model (lean — see AGENTS.md):
 *   paragraphs[]       string[]   content.split("\n\n"), needed for VList item count
 *   paragraphOffsets[] number[]   byte offset where each paragraph starts in content
 *
 * Per-paragraph word offsets are computed at render time inside <Paragraph>.
 * Only ~20–30 paragraphs are mounted at any time, so this is negligible work.
 *
 * Scroll → position: paragraphOffsets[ref.findItemIndex(scrollOffset)]  → O(1)
 * Open  → scroll:    binary search paragraphOffsets for book.position   → O(log p)
 * Tap   → position:  data-offset attribute on the <span>                → O(1)
 *
 * Scroll restoration: module-level Map<bookId, CacheSnapshot> so virtua
 * restores pixel-accurate position on repeat visits without any DB storage.
 */

import {
	IonBackButton,
	IonButton,
	IonButtons,
	IonContent,
	IonHeader,
	IonIcon,
	IonPage,
	IonSpinner,
	IonTitle,
	IonToolbar,
} from "@ionic/react";
import { addOutline, removeOutline } from "ionicons/icons";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RouteComponentProps } from "react-router-dom";
import type { CacheSnapshot, VListHandle } from "virtua";
import { VList } from "virtua";
import { useBookSync } from "../../contexts/book-sync-context";
import { queries } from "../../services/db/queries";
import type { Book } from "../../services/db/schema";
import Paragraph, { getHeadingLevel, getWordOffsets, utf8ByteLength } from "./paragraph";

// ─── Scroll cache ────────────────────────────────────────────────────────────
// Stored outside the component so it survives navigation away and back.
const scrollCache = new Map<string, CacheSnapshot>();

// Sentinel value: no word highlighted (while scrolling)
const NO_HIGHLIGHT = -1;

// ─── Font size ───────────────────────────────────────────────────────────────
const FONT_SIZE_KEY = "reader_font_size";
const FONT_SIZE_MIN = 12;
const FONT_SIZE_MAX = 28;
const FONT_SIZE_STEP = 2;
const FONT_SIZE_DEFAULT = 17;

function loadFontSize(): number {
	const v = localStorage.getItem(FONT_SIZE_KEY);
	const n = v ? Number.parseInt(v, 10) : Number.NaN;
	return Number.isNaN(n) ? FONT_SIZE_DEFAULT : Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, n));
}

function saveFontSize(size: number): void {
	localStorage.setItem(FONT_SIZE_KEY, String(size));
}

// ─── Main page ───────────────────────────────────────────────────────────────

interface BookReaderProps extends RouteComponentProps<{ id: string }> {}

const BookReader: React.FC<BookReaderProps> = ({ match }) => {
	const id = match.params.id;
	const { pushPosition } = useBookSync();

	const [book, setBook] = useState<Book | null>(null);
	const [content, setContent] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [fontSize, setFontSize] = useState<number>(loadFontSize);

	// The byte offset we consider "current" — used for word highlight + saves
	const [activeOffset, setActiveOffset] = useState(0);

	const listRef = useRef<VListHandle>(null);

	// Whether the initial scroll-to-position has happened
	const didInitialScrollRef = useRef(false);

	// Track the last offset we set so we can flush on unmount.
	// null = not yet loaded from DB, don't overwrite on unmount.
	const lastOffsetRef = useRef<number | null>(null);

	// ── Load book metadata + content in parallel ───────────────────────────
	useEffect(() => {
		let cancelled = false;

		async function load() {
			try {
				const [meta, contentRow] = await Promise.all([
					queries.getBook(id),
					queries.getBookContent(id),
				]);

				if (cancelled) return;

				if (!meta || !contentRow?.content) {
					setLoading(false);
					return;
				}

				setBook(meta);
				setContent(contentRow.content);
				setActiveOffset(meta.position);
				lastOffsetRef.current = meta.position;
			} catch (_err) {
				// loading stays true — "not found" state will be shown
			} finally {
				if (!cancelled) setLoading(false);
			}
		}

		load();
		return () => {
			cancelled = true;
		};
	}, [id]);

	// ── Build paragraph index ──────────────────────────────────────────────
	// Computed once per content load. Two cheap structures:
	//   paragraphs[i]       — the text of paragraph i
	//   paragraphOffsets[i] — UTF-8 byte offset of paragraph i's first character
	//
	// We must use UTF-8 byte lengths (not JS .length) because the ESP32 tracks
	// position as a byte offset into book.txt. For any multi-byte character
	// (smart quotes, em-dashes, accented letters) the two diverge.
	const { paragraphs, paragraphOffsets } = useMemo(() => {
		if (!content) return { paragraphs: [], paragraphOffsets: [] };

		const paras = content.split("\n\n");
		const offsets: number[] = new Array(paras.length);
		let offset = 0;
		for (let i = 0; i < paras.length; i++) {
			offsets[i] = offset;
			offset += utf8ByteLength(paras[i]) + 2; // +2 for the "\n\n" separator (always 2 UTF-8 bytes)
		}
		return { paragraphs: paras, paragraphOffsets: offsets };
	}, [content]);

	// ── Initial scroll to saved position ──────────────────────────────────
	useEffect(() => {
		if (didInitialScrollRef.current) return;
		if (!listRef.current || paragraphs.length === 0 || book === null) return;

		didInitialScrollRef.current = true;

		if (book.position === 0) return; // start of book — default scroll is correct

		// Binary search: find the last paragraph whose offset ≤ book.position
		const target = book.position;
		let lo = 0;
		let hi = paragraphOffsets.length - 1;
		while (lo < hi) {
			const mid = Math.ceil((lo + hi) / 2);
			if (paragraphOffsets[mid] <= target) {
				lo = mid;
			} else {
				hi = mid - 1;
			}
		}

		listRef.current.scrollToIndex(lo, { align: "start" });
	}, [paragraphs, paragraphOffsets, book]);

	// ── Save position to DB + BLE ─────────────────────────────────────────
	const savePosition = useCallback(
		async (offset: number) => {
			await queries.updateBook(id, { position: offset, lastRead: Date.now() });
			await pushPosition(offset);
		},
		[id, pushPosition],
	);

	// ── Scroll handler — hide highlight (no position save, handleScrollEnd does that) ──
	const handleScroll = useCallback((_scrollOffset: number) => {
		// Hide highlight while scrolling. Skip the state update if already hidden
		// to avoid triggering re-renders of all visible Paragraphs every frame.
		setActiveOffset((prev) => (prev === NO_HIGHLIGHT ? prev : NO_HIGHLIGHT));
	}, []);

	// ── Scroll end — compute highlight + save position ───────────────────
	const handleScrollEnd = useCallback(() => {
		if (!listRef.current || paragraphOffsets.length === 0) return;

		const list = listRef.current;
		// Nudge past the top edge by one line-height so the highlighted word
		// is comfortably visible, not in the clipped-off portion above the fold.
		const visibleTop = list.scrollOffset + fontSize * 1.75;
		let paraIdx = list.findItemIndex(visibleTop);

		// Skip headings — they have no tappable words
		while (paraIdx < paragraphs.length && getHeadingLevel(paragraphs[paraIdx]) > 0) {
			paraIdx++;
		}
		if (paraIdx >= paragraphs.length) return;

		const paraText = paragraphs[paraIdx];
		const paraStart = paragraphOffsets[paraIdx];
		const wordOffsets = getWordOffsets(paraText, paraStart);

		if (wordOffsets.length === 0) {
			setActiveOffset(paraStart);
			lastOffsetRef.current = paraStart;
			savePosition(paraStart);
			return;
		}

		// Estimate which word is at the visible top via pixel fraction
		const paraPixelTop = list.getItemOffset(paraIdx);
		const paraPixelHeight = list.getItemSize(paraIdx);
		const pixelsInto = Math.max(0, visibleTop - paraPixelTop);
		const fraction = paraPixelHeight > 0 ? pixelsInto / paraPixelHeight : 0;
		const wordIdx = Math.min(Math.floor(fraction * wordOffsets.length), wordOffsets.length - 1);
		const byteOffset = wordOffsets[wordIdx];

		setActiveOffset(byteOffset);
		lastOffsetRef.current = byteOffset;
		savePosition(byteOffset);
	}, [paragraphs, paragraphOffsets, savePosition, fontSize]);

	// ── Word tap handler ───────────────────────────────────────────────────
	const handleWordTap = useCallback(
		(offset: number) => {
			setActiveOffset(offset);
			lastOffsetRef.current = offset;
			// Immediate save — no debounce
			queries.updateBook(id, { position: offset, lastRead: Date.now() });
			pushPosition(offset);
		},
		[id, pushPosition],
	);

	// ── Font size ──────────────────────────────────────────────────────────
	const handleFontSizeChange = useCallback((delta: number) => {
		setFontSize((prev) => {
			const next = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, prev + delta));
			saveFontSize(next);
			return next;
		});
	}, []);

	// ── Save scroll cache + flush position on unmount ─────────────────────
	useEffect(() => {
		return () => {
			if (listRef.current) {
				scrollCache.set(id, listRef.current.cache);
			}
			// Flush position to DB so the library shows updated progress.
			// Only write if we actually loaded the book (lastOffsetRef !== null).
			const offset = lastOffsetRef.current;
			if (offset !== null) {
				queries.updateBook(id, { position: offset, lastRead: Date.now() });
			}
		};
	}, [id]);

	// ─── Render ─────────────────────────────────────────────────────────────

	if (loading) {
		return (
			<IonPage>
				<IonContent className="ion-text-center no-header-content">
					<div
						style={{
							display: "flex",
							height: "100%",
							alignItems: "center",
							justifyContent: "center",
						}}
					>
						<IonSpinner />
					</div>
				</IonContent>
			</IonPage>
		);
	}

	if (!book || !content) {
		return (
			<IonPage>
				<IonHeader class="ion-no-border">
					<IonToolbar>
						<IonButtons slot="start">
							<IonBackButton defaultHref="/tabs/library" />
						</IonButtons>
					</IonToolbar>
				</IonHeader>
				<IonContent className="ion-padding ion-text-center">
					<p>Book not found.</p>
				</IonContent>
			</IonPage>
		);
	}

	return (
		<IonPage>
			<IonHeader class="ion-no-border">
				<IonToolbar>
					<IonButtons slot="start">
						<IonBackButton defaultHref="/tabs/library" />
					</IonButtons>
					<IonTitle>{book.title}</IonTitle>
					<IonButtons slot="end">
						<IonButton
							onClick={() => handleFontSizeChange(-FONT_SIZE_STEP)}
							disabled={fontSize <= FONT_SIZE_MIN}
							aria-label="Decrease font size"
						>
							<IonIcon slot="icon-only" icon={removeOutline} />
						</IonButton>
						<IonButton
							onClick={() => handleFontSizeChange(FONT_SIZE_STEP)}
							disabled={fontSize >= FONT_SIZE_MAX}
							aria-label="Increase font size"
						>
							<IonIcon slot="icon-only" icon={addOutline} />
						</IonButton>
					</IonButtons>
				</IonToolbar>
			</IonHeader>

			<IonContent scrollY={false}>
				<VList
					ref={listRef}
					cache={scrollCache.get(id)}
					style={{ height: "100%", padding: "0 20px", fontSize: `${fontSize}px` }}
					onScroll={handleScroll}
					onScrollEnd={handleScrollEnd}
				>
					{paragraphs.map((text, i) => (
						<Paragraph
							key={i}
							text={text}
							startOffset={paragraphOffsets[i]}
							activeOffset={activeOffset}
							onWordTap={handleWordTap}
						/>
					))}
				</VList>
			</IonContent>
		</IonPage>
	);
};

export default BookReader;
