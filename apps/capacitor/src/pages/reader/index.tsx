import type React from "react";
import { useState } from "react";
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
 * Scroll → position: top-left visible word span (querySelectorAll)      → O(n) n = visible spans
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
	IonItem,
	IonLabel,
	IonList,
	IonModal,
	IonPage,
	IonSpinner,
	IonTitle,
	IonToolbar,
} from "@ionic/react";
import { useQueryClient } from "@tanstack/react-query";
import {
	addOutline,
	flashOffOutline,
	flashOutline,
	listOutline,
	moonOutline,
	removeOutline,
	searchOutline,
	sunnyOutline,
} from "ionicons/icons";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { RouteComponentProps } from "react-router-dom";
import type { CacheSnapshot, VListHandle } from "virtua";
import { VList } from "virtua";
import { useBookSync } from "../../contexts/book-sync-context";
import { useTheme } from "../../contexts/theme-context";
import { queryHooks } from "../../services/db/hooks";
import { bookKeys } from "../../services/db/hooks/query-keys";
import { queries } from "../../services/db/queries";
import type { Chapter } from "../../services/db/schema";
import { DEFAULT_SETTINGS } from "../../utils/settings";
import DictionaryModal from "./dictionary-modal";
import Paragraph, { getWordOffsets, utf8ByteLength } from "./paragraph";
import { type RsvpSettings, buildWordIndex, findWordIndexAtOffset } from "./rsvp-engine";
import RsvpView from "./rsvp-view";
import SearchModal from "./search-modal";

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
	const qc = useQueryClient();

	// ── Data queries ──────────────────────────────────────────────────────
	const { data: book, isPending: bookPending } = queryHooks.useBook(id);
	const { data: contentRow, isPending: contentPending } = queryHooks.useBookContent(id);
	const content = contentRow?.content ?? null;
	const loading = bookPending || contentPending;

	const [fontSize, setFontSize] = useState<number>(loadFontSize);
	const { theme, toggleTheme } = useTheme();
	const [tocOpen, setTocOpen] = useState(false);
	const [searchOpen, setSearchOpen] = useState(false);
	const [searchInitialQuery, setSearchInitialQuery] = useState<string | undefined>(undefined);
	const [selectedWord, setSelectedWord] = useState<string | null>(null);

	// ── RSVP mode ─────────────────────────────────────────────────────────
	const [readerMode, setReaderMode] = useState<"scroll" | "rsvp">("scroll");
	const [rsvpWordIndex, setRsvpWordIndex] = useState(0);

	// The byte offset we consider "current" — used for word highlight + saves
	const [activeOffset, setActiveOffset] = useState(0);
	// Tracks position for the progress bar — updated during scroll (activeOffset
	// is set to NO_HIGHLIGHT=-1 while scrolling, so can't be used for progress).
	const [progressOffset, setProgressOffset] = useState(0);

	// Progress bar visibility — shown on tap/word-tap, hidden when user scrolls
	const [progressBarVisible, setProgressBarVisible] = useState(false);
	const isScrubbingRef = useRef(false);

	const listRef = useRef<VListHandle>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	// Whether the initial scroll-to-position has happened
	const didInitialScrollRef = useRef(false);

	// Suppresses the handleScrollEnd that fires after the programmatic
	// scrollToIndex on first render — prevents overwriting the precise
	// saved position with whatever word happens to be at the top.
	const suppressNextScrollEndRef = useRef(false);

	// Suppresses handleScroll from clearing activeOffset after a
	// programmatic jump (search, chapter). Without this the scroll
	// event fires *after* setActiveOffset and wipes the highlight.
	const suppressScrollHighlightClearRef = useRef(false);

	// Track the last offset we set so we can flush on unmount.
	// null = not yet loaded from DB, don't overwrite on unmount.
	const lastOffsetRef = useRef<number | null>(null);

	// ── Seed activeOffset + lastOffsetRef once book loads ─────────────────
	useEffect(() => {
		if (book) {
			setActiveOffset(book.position);
			setProgressOffset(book.position);
			lastOffsetRef.current = book.position;
		}
	}, [book]);

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

	// ── Parse chapters ────────────────────────────────────────────────────
	const chapters = useMemo<Chapter[]>(() => {
		if (!contentRow?.chapters) return [];
		try {
			return JSON.parse(contentRow.chapters) as Chapter[];
		} catch {
			return [];
		}
	}, [contentRow?.chapters]);

	// ── RSVP word index + settings ────────────────────────────────────────
	const wordIndex = useMemo(() => (content ? buildWordIndex(content) : []), [content]);

	const { data: dbSettings } = queryHooks.useSettings();
	const rsvpSettings = useMemo<RsvpSettings>(
		() => ({
			wpm: dbSettings?.wpm ?? DEFAULT_SETTINGS.WPM,
			delayComma: dbSettings?.delayComma ?? DEFAULT_SETTINGS.DELAY_COMMA,
			delayPeriod: dbSettings?.delayPeriod ?? DEFAULT_SETTINGS.DELAY_PERIOD,
			accelStart: dbSettings?.accelStart ?? DEFAULT_SETTINGS.ACCEL_START,
			accelRate: dbSettings?.accelRate ?? DEFAULT_SETTINGS.ACCEL_RATE,
			xOffset: dbSettings?.xOffset ?? DEFAULT_SETTINGS.X_OFFSET,
		}),
		[dbSettings],
	);

	// ── Save position to DB + BLE ─────────────────────────────────────────
	// Fire-and-forget writes — no mutation wrapper needed for high-frequency saves.
	const savePosition = useCallback(
		async (offset: number) => {
			await queries.updateBook(id, { position: offset, lastRead: Date.now() });
			await pushPosition(offset);
		},
		[id, pushPosition],
	);

	// ── Shared helpers ────────────────────────────────────────────────────
	/** Binary search: find the last paragraph index whose offset ≤ targetByte. */
	const findParagraphIndex = useCallback(
		(targetByte: number): number => {
			let lo = 0;
			let hi = paragraphOffsets.length - 1;
			while (lo < hi) {
				const mid = Math.ceil((lo + hi) / 2);
				if (paragraphOffsets[mid] <= targetByte) lo = mid;
				else hi = mid - 1;
			}
			return lo;
		},
		[paragraphOffsets],
	);

	/** Scroll to a byte offset, update highlight + progress, and persist. */
	const jumpToOffset = useCallback(
		(byteOffset: number, { highlight = true }: { highlight?: boolean } = {}) => {
			if (!listRef.current) return;
			const idx = findParagraphIndex(byteOffset);
			suppressNextScrollEndRef.current = true;
			if (highlight) suppressScrollHighlightClearRef.current = true;
			listRef.current.scrollToIndex(idx, { align: "start" });
			setActiveOffset(byteOffset);
			setProgressOffset(byteOffset);
			lastOffsetRef.current = byteOffset;
			savePosition(byteOffset);
		},
		[findParagraphIndex, savePosition],
	);

	// ── Initial scroll to saved position ──────────────────────────────────
	// Also re-runs when readerMode changes to "scroll" (returning from RSVP).
	useEffect(() => {
		if (didInitialScrollRef.current) return;
		if (readerMode !== "scroll") return;
		if (!listRef.current || paragraphs.length === 0 || !book) return;

		didInitialScrollRef.current = true;

		// Use lastOffsetRef if available (e.g. returning from RSVP mode),
		// otherwise fall back to the DB-stored position.
		const target = lastOffsetRef.current ?? book.position;
		if (target === 0) return; // start of book — default scroll is correct

		const idx = findParagraphIndex(target);
		suppressNextScrollEndRef.current = true;
		suppressScrollHighlightClearRef.current = true;
		listRef.current.scrollToIndex(idx, { align: "start" });
		// Set the highlight directly — handleScrollEnd is suppressed to
		// avoid it picking a different top-left word.
		setActiveOffset(target);
	}, [readerMode, paragraphs, paragraphOffsets, book, findParagraphIndex]);

	// ── Scroll handler — hide highlight + update progress bar ──────────────
	const handleScroll = useCallback(
		(scrollOffset: number) => {
			// Hide highlight while scrolling. Skip the state update if already hidden
			// to avoid triggering re-renders of all visible Paragraphs every frame.
			// After a programmatic jump (search/chapter) we keep the highlight.
			if (suppressScrollHighlightClearRef.current) {
				// Don't clear here — multiple scroll events fire; cleared in handleScrollEnd.
			} else {
				setActiveOffset((prev) => (prev === NO_HIGHLIGHT ? prev : NO_HIGHLIGHT));
			}
			// Hide progress bar — user is scrolling normally, not scrubbing
			if (!isScrubbingRef.current) setProgressBarVisible(false);
			// Update the progress bar live. findItemIndex maps the current scroll
			// pixel offset to a paragraph index, which we convert to a byte offset.
			if (listRef.current && paragraphOffsets.length > 0) {
				const idx = Math.min(
					listRef.current.findItemIndex(scrollOffset),
					paragraphOffsets.length - 1,
				);
				setProgressOffset(paragraphOffsets[idx] ?? 0);
			}
		},
		[paragraphOffsets],
	);

	// ── Scroll end — find top-left visible word + save position ─────────
	const handleScrollEnd = useCallback(() => {
		if (suppressNextScrollEndRef.current) {
			suppressNextScrollEndRef.current = false;
			suppressScrollHighlightClearRef.current = false;
			return;
		}
		// Don't save until the initial scroll-to-position has run,
		// otherwise a hot reload would overwrite the saved position with 0.
		if (!didInitialScrollRef.current) return;
		if (!listRef.current || !containerRef.current) return;

		const cutoffTop = containerRef.current.getBoundingClientRect().top;

		// All word <span>s currently in the DOM (only ~20-30 paragraphs via VList).
		// Each carries a data-offset with its exact UTF-8 byte offset.
		const spans = document.querySelectorAll<HTMLElement>("span[data-offset]");
		if (spans.length === 0) return;

		// Find the top-left visible word: smallest Y not hidden behind the
		// header, then smallest X to break ties on the same line.
		let bestOffset = -1;
		let bestTop = Number.POSITIVE_INFINITY;
		let bestLeft = Number.POSITIVE_INFINITY;

		for (const span of spans) {
			const rect = span.getBoundingClientRect();
			if (rect.top < cutoffTop) continue; // hidden behind header/toolbar
			if (rect.top < bestTop || (rect.top === bestTop && rect.left < bestLeft)) {
				bestTop = rect.top;
				bestLeft = rect.left;
				bestOffset = Number.parseInt(span.dataset.offset!, 10);
			}
		}

		if (bestOffset < 0) return;

		setActiveOffset(bestOffset);
		setProgressOffset(bestOffset);
		lastOffsetRef.current = bestOffset;
		savePosition(bestOffset);
	}, [savePosition]);

	// ── Word tap handler ───────────────────────────────────────────────────
	// First tap on a word: set position (highlight it).
	// Second tap on the already-highlighted word: open dictionary.
	const handleWordTap = useCallback(
		(offset: number, wordText: string) => {
			if (offset === activeOffset) {
				// Second tap on the highlighted word — open dictionary
				const clean = wordText.replace(/[^a-zA-Z'-]/g, "").toLowerCase();
				if (clean) setSelectedWord(clean);
				return;
			}
			setActiveOffset(offset);
			setProgressOffset(offset);
			setProgressBarVisible(true);
			lastOffsetRef.current = offset;
			// Immediate save — no debounce
			queries.updateBook(id, { position: offset, lastRead: Date.now() });
			pushPosition(offset);
		},
		[id, pushPosition, activeOffset],
	);

	// ── Font size ──────────────────────────────────────────────────────────
	const handleFontSizeChange = useCallback((delta: number) => {
		setFontSize((prev) => {
			const next = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, prev + delta));
			saveFontSize(next);
			return next;
		});
	}, []);

	// ── Theme cycle ───────────────────────────────────────────────────────
	// toggleTheme comes from ThemeContext — updates the whole app.

	// ── RSVP helpers ─────────────────────────────────────────────────────

	const handleRsvpPositionChange = useCallback(
		(byteOffset: number) => {
			setProgressOffset(byteOffset);
			lastOffsetRef.current = byteOffset;
			savePosition(byteOffset);
		},
		[savePosition],
	);

	/** Switch from RSVP to scroll mode, positioning VList at the given byte offset. */
	const exitRsvpToScroll = useCallback(
		(byteOffset: number) => {
			lastOffsetRef.current = byteOffset;
			setProgressOffset(byteOffset);
			// Clear stale scroll cache so VList doesn't restore the old position;
			// the initial scroll effect will position it at byteOffset instead.
			scrollCache.delete(id);
			didInitialScrollRef.current = false;
			setReaderMode("scroll");
			savePosition(byteOffset);
		},
		[id, savePosition],
	);

	const handleRsvpToggle = useCallback(() => {
		if (readerMode === "scroll") {
			const idx = findWordIndexAtOffset(wordIndex, progressOffset);
			setRsvpWordIndex(idx);
			setReaderMode("rsvp");
			setProgressBarVisible(true);
		} else {
			exitRsvpToScroll(lastOffsetRef.current ?? progressOffset);
		}
	}, [readerMode, progressOffset, wordIndex, exitRsvpToScroll]);

	const handleRsvpFinished = useCallback(() => {
		exitRsvpToScroll(lastOffsetRef.current ?? 0);
	}, [exitRsvpToScroll]);

	// ── Chapter jump ──────────────────────────────────────────────────────
	const handleChapterJump = useCallback(
		(startByte: number) => {
			if (readerMode === "rsvp") {
				exitRsvpToScroll(startByte);
			} else {
				jumpToOffset(startByte);
			}
			setTocOpen(false);
		},
		[readerMode, jumpToOffset, exitRsvpToScroll],
	);

	// ── Search jump ───────────────────────────────────────────────────────────
	// The search modal gives us a JS char offset (indexOf result). We convert
	// it to a UTF-8 byte offset, then snap to the nearest word so the matched
	// word gets highlighted.
	const handleSearchJump = useCallback(
		(charOffset: number) => {
			if (!content) return;
			const byteOffset = utf8ByteLength(content.slice(0, charOffset));

			// Find the exact word offset within the paragraph so the matched
			// word gets highlighted (not just the paragraph start).
			const paraIdx = findParagraphIndex(byteOffset);
			const paraText = paragraphs[paraIdx] ?? "";
			const paraStart = paragraphOffsets[paraIdx] ?? 0;
			const wordOffsets = getWordOffsets(paraText, paraStart);
			let wordByte = paraStart;
			for (const wo of wordOffsets) {
				if (wo <= byteOffset) wordByte = wo;
				else break;
			}

			if (readerMode === "rsvp") {
				setActiveOffset(wordByte);
				exitRsvpToScroll(wordByte);
			} else {
				jumpToOffset(wordByte);
			}
		},
		[content, paragraphs, paragraphOffsets, readerMode, findParagraphIndex, jumpToOffset, exitRsvpToScroll],
	);

	// ── Progress bar tap/drag ─────────────────────────────────────────────
	const progressBarRef = useRef<HTMLDivElement>(null);
	// Origin of the current pointer-down gesture — used to detect horizontal intent
	const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
	// Minimum horizontal travel (px) before a drag is treated as a scrub.
	// Below this threshold a vertical swipe-up (home gesture) is ignored.
	const MIN_SCRUB_PX = 8;

	const scrubToX = useCallback(
		(clientX: number) => {
			if (!progressBarRef.current || !book) return;
			const rect = progressBarRef.current.getBoundingClientRect();
			const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
			const targetByte = Math.round(ratio * book.size);

			if (readerMode === "rsvp") {
				// In RSVP mode: update the word index (pauses via initialWordIndex change)
				const wIdx = findWordIndexAtOffset(wordIndex, targetByte);
				setRsvpWordIndex(wIdx);
				setProgressOffset(targetByte);
				lastOffsetRef.current = targetByte;
				savePosition(targetByte);
			} else {
				const idx = findParagraphIndex(targetByte);
				const actualByte = paragraphOffsets[idx] ?? 0;
				jumpToOffset(actualByte, { highlight: false });
			}
		},
		[book, readerMode, wordIndex, paragraphOffsets, findParagraphIndex, jumpToOffset, savePosition],
	);

	const handleProgressPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
		e.currentTarget.setPointerCapture(e.pointerId);
		// Record origin — scrubbing is committed only once horizontal intent is
		// confirmed (pointermove/pointerup). This prevents the iOS swipe-up home
		// gesture from accidentally jumping the reading position.
		pointerDownRef.current = { x: e.clientX, y: e.clientY };
	}, []);

	/** Returns true when the pointer has moved far enough horizontally to count as a scrub. */
	const isHorizontalScrub = (
		origin: { x: number; y: number },
		clientX: number,
		clientY: number,
	) => {
		const dx = Math.abs(clientX - origin.x);
		const dy = Math.abs(clientY - origin.y);
		return dx >= MIN_SCRUB_PX && dx > dy;
	};

	const handleProgressPointerMove = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			if (e.buttons === 0 || !pointerDownRef.current) return;
			if (!isHorizontalScrub(pointerDownRef.current, e.clientX, e.clientY)) return;
			isScrubbingRef.current = true;
			scrubToX(e.clientX);
		},
		[scrubToX],
	);

	const handleProgressPointerUp = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			const origin = pointerDownRef.current;
			pointerDownRef.current = null;
			isScrubbingRef.current = false;
			if (!origin) return;
			// Plain tap (no meaningful horizontal drag) — scrub to the tap position.
			if (!isHorizontalScrub(origin, e.clientX, e.clientY)) {
				setProgressBarVisible(true);
				scrubToX(e.clientX);
			}
		},
		[scrubToX],
	);

	// ── Show progress bar on any tap in the reading area ─────────────────
	// Native listener needed because VList's internal scroll container doesn't
	// propagate clicks through React's synthetic event system.
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const show = () => setProgressBarVisible(true);
		el.addEventListener("click", show);
		return () => el.removeEventListener("click", show);
	}, []);

	// ── Hide tab bar while reader is mounted ──────────────────────────────
	// Ionic's shadow DOM toggles tab-bar-hidden on keyboard show/hide, and
	// external CSS can't override :host styles reliably. A body class lets
	// us target ion-tab-bar from outside the shadow DOM with higher priority.
	useEffect(() => {
		document.body.classList.add("reader-open");
		return () => {
			document.body.classList.remove("reader-open");
		};
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
			// Invalidate the books list so the library grid picks up the new position
			// when the user navigates back.
			qc.invalidateQueries({ queryKey: bookKeys.all });
		};
	}, [id, qc]);

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

	const progressPct = book.size > 0 ? Math.min(100, (progressOffset / book.size) * 100) : 0;

	return (
		<IonPage className={`reader-theme-${theme}`}>
			<IonHeader class="ion-no-border">
				<IonToolbar>
					<IonButtons slot="start">
						<IonBackButton defaultHref="/tabs/library" />
					</IonButtons>
					<IonTitle>{book.title}</IonTitle>
					<IonButtons slot="end">
						<IonButton
							onClick={handleRsvpToggle}
							aria-label={readerMode === "rsvp" ? "Switch to scroll reader" : "Switch to RSVP reader"}
							className={readerMode === "rsvp" ? "rsvp-toggle-active" : undefined}
						>
							<IonIcon slot="icon-only" icon={readerMode === "rsvp" ? flashOffOutline : flashOutline} />
						</IonButton>
						<IonButton onClick={() => setSearchOpen(true)} aria-label="Search content">
							<IonIcon slot="icon-only" icon={searchOutline} />
						</IonButton>
						{chapters.length > 0 && (
							<IonButton onClick={() => setTocOpen(true)} aria-label="Table of contents">
								<IonIcon slot="icon-only" icon={listOutline} />
							</IonButton>
						)}
						<IonButton onClick={toggleTheme} aria-label="Switch reading theme">
							<IonIcon slot="icon-only" icon={theme === "dark" ? sunnyOutline : moonOutline} />
						</IonButton>
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
				{readerMode === "scroll" ? (
					<div ref={containerRef} style={{ height: "100%" }}>
						<VList
							ref={listRef}
							cache={scrollCache.get(id)}
							style={{
								height: "100%",
								padding: "0 20px",
								paddingBottom: "calc(52px + env(safe-area-inset-bottom, 0px))",
								fontSize: `${fontSize}px`,
							}}
							onScroll={handleScroll}
							onScrollEnd={handleScrollEnd}
						>
							{paragraphs.map((text, i) => (
								<Paragraph
									key={i.toString()}
									text={text}
									startOffset={paragraphOffsets[i]}
									activeOffset={activeOffset}
									onWordTap={handleWordTap}
								/>
							))}
						</VList>
					</div>
				) : (
					<RsvpView
						words={wordIndex}
						initialWordIndex={rsvpWordIndex}
						settings={rsvpSettings}
						fontSize={fontSize}
						onPositionChange={handleRsvpPositionChange}
						onFinished={handleRsvpFinished}
					/>
				)}

				{/* ── Progress bar ── */}
				{(progressBarVisible || readerMode === "rsvp") && (
					// biome-ignore lint/a11y/useFocusableInteractive: scrubber
					<div
						ref={progressBarRef}
						className="reader-progress-bar"
						onPointerDown={handleProgressPointerDown}
						onPointerMove={handleProgressPointerMove}
						onPointerUp={handleProgressPointerUp}
						aria-label="Reading progress"
						role="slider"
						aria-valuenow={Math.round(progressPct)}
						aria-valuemin={0}
						aria-valuemax={100}
					>
						<div className="reader-progress-fill-track">
							<div className="reader-progress-fill" style={{ width: `${progressPct}%` }} />
						</div>
						<span className="reader-progress-label">{Math.round(progressPct)}%</span>
					</div>
				)}
			</IonContent>

			{/* ── TOC modal ── */}
			<IonModal
				isOpen={tocOpen}
				onDidDismiss={() => setTocOpen(false)}
				breakpoints={[0, 0.5, 0.9]}
				initialBreakpoint={0.5}
				className={["rsvp-toc-modal", `reader-theme-${theme}`].join(" ")}
			>
				<IonHeader>
					<IonToolbar>
						<IonTitle>Contents</IonTitle>
						<IonButtons slot="end">
							<IonButton onClick={() => setTocOpen(false)}>Close</IonButton>
						</IonButtons>
					</IonToolbar>
				</IonHeader>
				<IonContent>
					<IonList>
						{chapters.map((ch, i) => (
							<IonItem
								key={i.toString()}
								button
								detail={false}
								onClick={() => handleChapterJump(ch.startByte)}
							>
								<IonLabel>{ch.title}</IonLabel>
							</IonItem>
						))}
					</IonList>
				</IonContent>
			</IonModal>

			{/* ── Search modal ── */}
			<SearchModal
				isOpen={searchOpen}
				onClose={() => { setSearchOpen(false); setSearchInitialQuery(undefined); }}
				content={content}
				onJump={handleSearchJump}
				theme={theme}
				initialQuery={searchInitialQuery}
			/>

			{/* ── Dictionary modal ── */}
			<DictionaryModal
				word={selectedWord}
				onClose={() => setSelectedWord(null)}
				onSearch={(w) => {
					setSelectedWord(null);
					setSearchInitialQuery(w);
					setSearchOpen(true);
				}}
				theme={theme}
			/>
		</IonPage>
	);
};

export default BookReader;
