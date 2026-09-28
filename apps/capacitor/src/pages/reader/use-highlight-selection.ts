/**
 * useHighlightSelection: selection-mode state machine (anchor/end/color/note),
 * floating toolbar + two drag handles. The same selection covers a new range
 * and an existing highlight (loaded by `openHighlightEditor`), so creating and
 * editing share one toolbar. Positions are word indices; text extraction
 * converts to a byte range via the active WordIndex when slicing `contentBytes`.
 */

import { type WordIndex, wordPos } from "@lesefluss/core";
import type React from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "../../components/toast";
import { queryHooks } from "../../services/db/hooks";
import type { Highlight } from "../../services/db/schema";
import { dragStep, tick } from "../../services/haptics";
import { randomHexId } from "../../utils/random-id";
import type { HighlightRange } from "./paragraph";
import { HIGHLIGHT_COLORS, type HighlightColor } from "./selection-toolbar";
import { computeToolbarPosition, HANDLE_V_PAD } from "./toolbar-position";
import { wordIndexAt } from "./word-at-point";

const _decoder = new TextDecoder();

const LAST_COLOR_KEY = "lesefluss:highlight-color";

function asHighlightColor(value: string | null): HighlightColor | null {
	return (HIGHLIGHT_COLORS as readonly string[]).includes(value ?? "")
		? (value as HighlightColor)
		: null;
}

function loadLastColor(): HighlightColor {
	try {
		return asHighlightColor(localStorage.getItem(LAST_COLOR_KEY)) ?? "yellow";
	} catch {
		return "yellow";
	}
}

function saveLastColor(color: HighlightColor): void {
	try {
		localStorage.setItem(LAST_COLOR_KEY, color);
	} catch {
		// Private mode or blocked storage: the next highlight falls back to yellow.
	}
}

// Must match .selection-handle width in monochrome.css
const HANDLE_WIDTH = 44;
const HANDLE_H_HALF = HANDLE_WIDTH / 2;

interface Params {
	bookId: string;
	contentBytes: Uint8Array | null;
	highlightRows: Highlight[];
	/** Word index of each paragraph's first word, for paragraph-membership tests. */
	paragraphStartWords: number[];
	/** Total word count, used as the end-sentinel for the last paragraph. */
	totalWords: number;
	/**
	 * WordIndex for the active book. Required to convert word ranges to byte
	 * slices for snippet extraction (highlight `text` column + edit modal).
	 */
	wordIndex?: WordIndex | null;
}

export function useHighlightSelection({
	bookId,
	contentBytes,
	highlightRows,
	paragraphStartWords,
	totalWords,
	wordIndex,
}: Params) {
	// ── Mutations ─────────────────────────────────────────────────────────
	const addHighlightMutation = queryHooks.useAddHighlight();
	const updateHighlightMutation = queryHooks.useUpdateHighlight();
	const deleteHighlightMutation = queryHooks.useDeleteHighlight();

	// ── Selection state (word indices) ────────────────────────────────────
	// selectionAnchor: word index where selection started (null = not selecting)
	// selectionEnd:    word index of the current drag end
	// selectionColor:  null = not saved yet
	// selectionSavedId: null = not saved yet; set = new highlight or existing one being edited
	const [selectionAnchor, setSelectionAnchor] = useState<number | null>(null);
	const [selectionEnd, setSelectionEnd] = useState<number | null>(null);
	const [selectionColor, setSelectionColor] = useState<HighlightColor | null>(null);
	const [selectionSavedId, setSelectionSavedId] = useState<string | null>(null);
	const [pendingNote, setPendingNote] = useState("");
	const [noteInputOpen, setNoteInputOpen] = useState(false);

	const isSelecting = selectionAnchor !== null;

	// Refs mirror selection state synchronously for event handlers that fire
	// before React commits (see `writeAnchor`/`writeEnd` below).
	const selectionAnchorRef = useRef<number | null>(null);
	const selectionEndRef = useRef<number | null>(null);
	const selectionSavedIdRef = useRef<string | null>(null);
	const startHandleRef = useRef<HTMLDivElement>(null);
	const endHandleRef = useRef<HTMLDivElement>(null);
	const toolbarRef = useRef<HTMLDivElement>(null);

	// Sync state + ref in one shot. Using refs alongside state lets event
	// handlers read the current value without stale-closure issues, AND
	// without depending on React's effect cycle to commit (which is too
	// late for handlers that fire in the same tick as the state update).
	const writeAnchor = useCallback((word: number | null) => {
		selectionAnchorRef.current = word;
		setSelectionAnchor(word);
	}, []);
	const writeEnd = useCallback((word: number | null) => {
		selectionEndRef.current = word;
		setSelectionEnd(word);
	}, []);
	const writeSavedId = useCallback((id: string | null) => {
		selectionSavedIdRef.current = id;
		setSelectionSavedId(id);
	}, []);

	// Derived: the active selection range (startWord <= endWord, both defined).
	const selectionRange = useMemo(() => {
		if (selectionAnchor === null || selectionEnd === null) return null;
		const startWord = Math.min(selectionAnchor, selectionEnd);
		const endWord = Math.max(selectionAnchor, selectionEnd);
		return { startWord, endWord };
	}, [selectionAnchor, selectionEnd]);

	// Clamps out-of-range highlights into the last paragraph so cross-device
	// drift (different tokenizer, re-import) doesn't render them invisibly.
	const highlightsByParagraph = useMemo<Map<number, HighlightRange[]>>(() => {
		const map = new Map<number, HighlightRange[]>();
		if (highlightRows.length === 0 || paragraphStartWords.length === 0 || totalWords === 0) {
			return map;
		}
		const maxWord = totalWords - 1;

		for (const h of highlightRows) {
			const startWord = Math.max(0, Math.min(maxWord, h.startWord));
			const endWord = Math.max(startWord, Math.min(maxWord, h.endWord));
			const range: HighlightRange = {
				id: h.id,
				startWord: wordPos(startWord),
				endWord: wordPos(endWord),
				color: h.color,
			};

			for (let i = 0; i < paragraphStartWords.length; i++) {
				const paraStartWord = paragraphStartWords[i];
				const paraEndWord =
					i + 1 < paragraphStartWords.length ? paragraphStartWords[i + 1] : totalWords;
				if (startWord < paraEndWord && endWord >= paraStartWord) {
					const existing = map.get(i);
					if (existing) {
						existing.push(range);
					} else {
						map.set(i, [range]);
					}
				}
			}
		}
		return map;
	}, [highlightRows, paragraphStartWords, totalWords]);

	// ── Text extraction + highlight lookup ────────────────────────────────
	// Word range → byte slice via WordIndex (string-edge case). Result is the
	// snippet stored in the highlight's `text` column / shown in the edit modal.
	const extractRangeText = useCallback(
		(startWord: number, endWord: number): string => {
			if (!contentBytes || !wordIndex || wordIndex.wordCount === 0) return "";
			const startByte = wordIndex.byteOfClamped(startWord);
			// End byte: start of word AFTER endWord (or content length).
			const endByte =
				endWord + 1 < wordIndex.wordCount
					? wordIndex.byteOfClamped(endWord + 1)
					: contentBytes.length;
			return _decoder.decode(contentBytes.slice(startByte, endByte)).replace(/\s+/g, " ").trim();
		},
		[contentBytes, wordIndex],
	);

	const findHighlightAt = useCallback(
		(word: number): Highlight | undefined => {
			return highlightRows.find((h) => word >= h.startWord && word <= h.endWord);
		},
		[highlightRows],
	);

	/** Select an existing highlight so the toolbar edits it and the handles resize it. */
	const openHighlightEditor = useCallback(
		(highlight: Highlight) => {
			writeAnchor(highlight.startWord);
			writeEnd(highlight.endWord);
			writeSavedId(highlight.id);
			setSelectionColor(asHighlightColor(highlight.color) ?? "yellow");
			setPendingNote(highlight.note ?? "");
		},
		[writeAnchor, writeEnd, writeSavedId],
	);

	/** Enter selection mode anchored at `word` (both anchor + end). */
	const startSelection = useCallback(
		(word: number) => {
			writeAnchor(word);
			writeEnd(word);
			writeSavedId(null);
			setSelectionColor(null);
			setPendingNote("");
		},
		[writeAnchor, writeEnd, writeSavedId],
	);

	/** Long-press on a word: edit the highlight under it, else start a selection. */
	const handleWordLongPress = useCallback(
		(wIdx: number) => {
			tick();
			const existing = findHighlightAt(wIdx);
			if (existing) {
				openHighlightEditor(existing);
				return;
			}
			startSelection(wIdx);
		},
		[findHighlightAt, openHighlightEditor, startSelection],
	);

	/** Extend an unsaved selection's end to a new word. Saved ones resize via the handles. */
	const extendSelectionTo = useCallback(
		(word: number) => {
			if (selectionAnchorRef.current === null || selectionSavedIdRef.current !== null) return;
			if (selectionEndRef.current === word) return;
			writeEnd(word);
			dragStep();
		},
		[writeEnd],
	);

	const cancelSelection = useCallback(() => {
		writeAnchor(null);
		writeEnd(null);
		writeSavedId(null);
		setSelectionColor(null);
		setPendingNote("");
	}, [writeAnchor, writeEnd, writeSavedId]);

	// ── Handle position sync ──────────────────────────────────────────────
	// Called after any selection range change or scroll event. Reads word span
	// positions from the DOM and updates handle styles directly (bypassing
	// React renders for smooth visual updates).
	const syncHandlePositions = useCallback(() => {
		if (!selectionRange) return;
		const startSpan = document.querySelector<HTMLElement>(
			`span[data-word="${selectionRange.startWord}"]`,
		);
		const endSpan = document.querySelector<HTMLElement>(
			`span[data-word="${selectionRange.endWord}"]`,
		);

		// Position start handle: bar runs along the left edge of the start word.
		if (startHandleRef.current) {
			if (startSpan) {
				const rect = startSpan.getBoundingClientRect();
				startHandleRef.current.style.left = `${rect.left - HANDLE_H_HALF}px`;
				startHandleRef.current.style.top = `${rect.top - HANDLE_V_PAD}px`;
				startHandleRef.current.style.setProperty("--bar-height", `${rect.height}px`);
				startHandleRef.current.style.display = "block";
			} else {
				startHandleRef.current.style.display = "none";
			}
		}

		// Position end handle: bar runs along the right edge of the end word.
		if (endHandleRef.current) {
			if (endSpan) {
				const rect = endSpan.getBoundingClientRect();
				endHandleRef.current.style.left = `${rect.right - HANDLE_H_HALF}px`;
				endHandleRef.current.style.top = `${rect.top - HANDLE_V_PAD}px`;
				endHandleRef.current.style.setProperty("--bar-height", `${rect.height}px`);
				endHandleRef.current.style.display = "block";
			} else {
				endHandleRef.current.style.display = "none";
			}
		}

		const toolbar = toolbarRef.current;
		// Zero size while hidden behind the note sheet; the sheet closing re-syncs.
		if (toolbar && toolbar.offsetWidth > 0 && startSpan && endSpan) {
			// The toolbar's scroll-margin carries the safe-area insets (see monochrome.css).
			const style = getComputedStyle(toolbar);
			const { top, left } = computeToolbarPosition({
				startRect: startSpan.getBoundingClientRect(),
				endRect: endSpan.getBoundingClientRect(),
				toolbar: { width: toolbar.offsetWidth, height: toolbar.offsetHeight },
				viewport: { width: window.innerWidth, height: window.innerHeight },
				safeTop: Number.parseFloat(style.scrollMarginTop) || 0,
				safeBottom: Number.parseFloat(style.scrollMarginBottom) || 0,
			});
			toolbar.style.top = `${top}px`;
			toolbar.style.left = `${left}px`;
		}
	}, [selectionRange]);

	// Keep a ref so scroll handler can call it without stale-closure issues
	const syncHandlesRef = useRef(syncHandlePositions);
	syncHandlesRef.current = syncHandlePositions;

	// Resizing or rotating moves the words and changes the viewport the toolbar is clamped to.
	useEffect(() => {
		if (!isSelecting) return;
		let frame = 0;
		const onResize = () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => syncHandlesRef.current());
		};
		window.addEventListener("resize", onResize);
		window.addEventListener("orientationchange", onResize);
		window.visualViewport?.addEventListener("resize", onResize);
		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener("resize", onResize);
			window.removeEventListener("orientationchange", onResize);
			window.visualViewport?.removeEventListener("resize", onResize);
		};
	}, [isSelecting]);

	// Re-measure when saving swaps the toolbar's buttons (its width moves its centred
	// position) and when the note sheet stops hiding it.
	// biome-ignore lint/correctness/useExhaustiveDependencies: selectionSavedId and noteInputOpen are re-measure triggers
	useLayoutEffect(() => {
		if (isSelecting) {
			syncHandlePositions();
		} else {
			if (startHandleRef.current) startHandleRef.current.style.display = "none";
			if (endHandleRef.current) endHandleRef.current.style.display = "none";
			// Toolbar is conditionally rendered (only when isSelecting) so no reset needed
		}
	}, [isSelecting, syncHandlePositions, selectionSavedId, noteInputOpen]);

	// ── Handle drag - shared factory for start/end handles ────────────────
	// `isStartHandle=true`  → we're dragging the min-word boundary
	// `isStartHandle=false` → we're dragging the max-word boundary
	// The role (anchor vs end) of each state var is fixed at drag-begin so a
	// swap mid-drag doesn't cause the handles to jump. Releasing a handle on a
	// saved highlight commits the new range.
	const makeHandleDragHandler = useCallback(
		(isStartHandle: boolean) => (e: React.PointerEvent<HTMLDivElement>) => {
			e.preventDefault();
			const anchor = selectionAnchorRef.current ?? 0;
			const end = selectionEndRef.current ?? 0;
			// Does `anchor` currently hold the edge we're dragging?
			const anchorHoldsDraggedEdge = isStartHandle ? anchor <= end : anchor >= end;
			let draggedWord = anchorHoldsDraggedEdge ? anchor : end;
			const onMove = (me: PointerEvent) => {
				const wIdx = wordIndexAt(me.clientX, me.clientY);
				if (wIdx === null || wIdx === draggedWord) return;
				draggedWord = wIdx;
				if (anchorHoldsDraggedEdge) writeAnchor(wIdx);
				else writeEnd(wIdx);
				dragStep();
			};
			// A cancelled drag commits too, so the saved row never lags the shown range.
			const onUp = () => {
				window.removeEventListener("pointermove", onMove);
				window.removeEventListener("pointerup", onUp);
				window.removeEventListener("pointercancel", onUp);
				const savedId = selectionSavedIdRef.current;
				const a = selectionAnchorRef.current;
				const b = selectionEndRef.current;
				if (!savedId || a === null || b === null || (a === anchor && b === end)) return;
				const startWord = Math.min(a, b);
				const endWord = Math.max(a, b);
				updateHighlightMutation.mutate({
					id: savedId,
					bookId,
					data: {
						startWord: wordPos(startWord),
						endWord: wordPos(endWord),
						text: extractRangeText(startWord, endWord) || null,
						updatedAt: Date.now(),
					},
				});
			};
			window.addEventListener("pointermove", onMove);
			window.addEventListener("pointerup", onUp);
			window.addEventListener("pointercancel", onUp);
		},
		[writeAnchor, writeEnd, bookId, extractRangeText, updateHighlightMutation],
	);

	const handleStartHandlePointerDown = useMemo(
		() => makeHandleDragHandler(true),
		[makeHandleDragHandler],
	);
	const handleEndHandlePointerDown = useMemo(
		() => makeHandleDragHandler(false),
		[makeHandleDragHandler],
	);

	// ── Saving ────────────────────────────────────────────────────────────
	// The toolbar stays open after saving so the user can recolour, resize or
	// add a note. charInWord is fixed at 0: selection handles snap to whole-word
	// boundaries. The DB column stays for a future sub-word selection feature.
	const createHighlight = useCallback(
		(color: HighlightColor) => {
			if (!selectionRange || !bookId) return;
			const now = Date.now();
			const newId = randomHexId();
			writeSavedId(newId);
			setSelectionColor(color);
			addHighlightMutation.mutate({
				id: newId,
				bookId,
				startWord: wordPos(selectionRange.startWord),
				startCharInWord: 0,
				endWord: wordPos(selectionRange.endWord),
				endCharInWord: 0,
				color,
				note: pendingNote || null,
				text: extractRangeText(selectionRange.startWord, selectionRange.endWord) || null,
				createdAt: now,
				updatedAt: now,
			});
		},
		[selectionRange, pendingNote, bookId, extractRangeText, addHighlightMutation, writeSavedId],
	);

	const handleSelectionHighlight = useCallback(() => {
		if (!selectionSavedId) createHighlight(loadLastColor());
	}, [selectionSavedId, createHighlight]);

	const handleSelectionColorChange = useCallback(
		(newColor: HighlightColor) => {
			saveLastColor(newColor);
			if (!selectionSavedId) {
				createHighlight(newColor);
				return;
			}
			setSelectionColor(newColor);
			updateHighlightMutation.mutate({
				id: selectionSavedId,
				bookId,
				data: { color: newColor, updatedAt: Date.now() },
			});
		},
		[selectionSavedId, bookId, createHighlight, updateHighlightMutation],
	);

	/** Saves first, so the note always has a highlight to land on. */
	const handleSelectionNote = useCallback(() => {
		if (!selectionSavedId) createHighlight(loadLastColor());
		setNoteInputOpen(true);
	}, [selectionSavedId, createHighlight]);

	const handleSelectionDelete = useCallback(() => {
		if (!selectionSavedId) return;
		deleteHighlightMutation.mutate(
			{ id: selectionSavedId, bookId },
			{ onSuccess: () => toast.info("Highlight removed") },
		);
		cancelSelection();
	}, [selectionSavedId, bookId, deleteHighlightMutation, cancelSelection]);

	const handleSelectionNoteDone = useCallback(() => {
		setNoteInputOpen(false);
		if (selectionSavedId && bookId) {
			updateHighlightMutation.mutate({
				id: selectionSavedId,
				bookId,
				data: { note: pendingNote || null, updatedAt: Date.now() },
			});
		}
	}, [selectionSavedId, pendingNote, bookId, updateHighlightMutation]);

	return {
		// Render state
		selectionRange,
		isSelecting,
		selectionColor,
		selectionSavedId,
		pendingNote,
		setPendingNote,
		noteInputOpen,
		highlightsByParagraph,

		// Refs (consumed by SelectionOverlay)
		startHandleRef,
		endHandleRef,
		toolbarRef,
		syncHandlesRef,

		// Handlers
		findHighlightAt,
		extractRangeText,
		openHighlightEditor,
		handleWordLongPress,
		startSelection,
		extendSelectionTo,
		cancelSelection,
		handleStartHandlePointerDown,
		handleEndHandlePointerDown,
		handleSelectionHighlight,
		handleSelectionColorChange,
		handleSelectionNote,
		handleSelectionNoteDone,
		handleSelectionDelete,
	};
}
