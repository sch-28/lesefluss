/**
 * useHighlightSelection: selection-mode state machine (anchor/end/color/note),
 * floating toolbar + two drag handles, edit-existing-highlight modal, and
 * the list modal. Positions are word indices; text extraction converts to
 * a byte range via the active WordIndex when slicing `contentBytes`.
 */

import { type WordIndex, wordPos } from "@lesefluss/core";
import type React from "react";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "../../components/toast";
import { queryHooks } from "../../services/db/hooks";
import type { Highlight } from "../../services/db/schema";
import { randomHexId } from "../../utils/random-id";
import type { HighlightRange } from "./paragraph";
import type { HighlightColor } from "./selection-toolbar";

const _decoder = new TextDecoder();

// Must match .selection-toolbar height in monochrome.css
const SELECTION_TOOLBAR_H = 48;
// Must match .selection-handle width and padding in monochrome.css
const HANDLE_WIDTH = 44;
const HANDLE_V_PAD = 10;
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

	// ── Edit modal state ──────────────────────────────────────────────────
	const [editingHighlight, setEditingHighlight] = useState<Highlight | null>(null);
	const [editingHighlightText, setEditingHighlightText] = useState("");

	// ── Selection state (word indices) ────────────────────────────────────
	// selectionAnchor: word index where selection started (null = not selecting)
	// selectionEnd:    word index of the current drag end
	// selectionColor:  null = no color picked yet (nothing auto-saved yet)
	// selectionSavedId: null = not yet saved (user is still positioning handles)
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

	/** Open the edit modal for a known highlight. */
	const openHighlightEditor = useCallback(
		(highlight: Highlight) => {
			setEditingHighlight(highlight);
			setEditingHighlightText(extractRangeText(highlight.startWord, highlight.endWord));
		},
		[extractRangeText],
	);

	/** Enter selection mode anchored at `word` (both anchor + end). */
	const startSelection = useCallback(
		(word: number) => {
			writeAnchor(word);
			writeEnd(word);
			setSelectionSavedId(null);
			setSelectionColor(null);
			setPendingNote("");
		},
		[writeAnchor, writeEnd],
	);

	/** Long-press on a word: open editor if highlighted, else start selection. */
	const handleWordLongPress = useCallback(
		(wIdx: number) => {
			const existing = findHighlightAt(wIdx);
			if (existing) {
				openHighlightEditor(existing);
				return;
			}
			startSelection(wIdx);
		},
		[findHighlightAt, openHighlightEditor, startSelection],
	);

	/** Extend the current selection's end to a new word. No-op if not selecting. */
	const extendSelectionTo = useCallback(
		(word: number) => {
			if (selectionAnchorRef.current === null) return;
			writeEnd(word);
		},
		[writeEnd],
	);

	const cancelSelection = useCallback(() => {
		writeAnchor(null);
		writeEnd(null);
		setSelectionSavedId(null);
		setSelectionColor(null);
		setPendingNote("");
	}, [writeAnchor, writeEnd]);

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

		// Position toolbar: above the selection start word if there is room,
		// otherwise below the selection end word.
		if (toolbarRef.current) {
			const GAP = 4;
			if (startSpan) {
				const startRect = startSpan.getBoundingClientRect();
				const above = startRect.top - SELECTION_TOOLBAR_H - GAP;
				if (above >= 0) {
					toolbarRef.current.style.top = `${above}px`;
					toolbarRef.current.style.bottom = "auto";
				} else if (endSpan) {
					const endRect = endSpan.getBoundingClientRect();
					// Below the end handle circle (bar-height + circle diameter ≈ end word height + 24)
					toolbarRef.current.style.top = `${endRect.bottom + endRect.height + 20 + GAP}px`;
					toolbarRef.current.style.bottom = "auto";
				}
			}
		}
	}, [selectionRange]);

	// Keep a ref so scroll handler can call it without stale-closure issues
	const syncHandlesRef = useRef(syncHandlePositions);
	syncHandlesRef.current = syncHandlePositions;

	// Sync handle/toolbar positions after every render that changes selection or mode
	useLayoutEffect(() => {
		if (isSelecting) {
			syncHandlePositions();
		} else {
			if (startHandleRef.current) startHandleRef.current.style.display = "none";
			if (endHandleRef.current) endHandleRef.current.style.display = "none";
			// Toolbar is conditionally rendered (only when isSelecting) so no reset needed
		}
	}, [isSelecting, syncHandlePositions]);

	// ── Handle drag - shared factory for start/end handles ────────────────
	// `isStartHandle=true`  → we're dragging the min-word boundary
	// `isStartHandle=false` → we're dragging the max-word boundary
	// The role (anchor vs end) of each state var is fixed at drag-begin so a
	// swap mid-drag doesn't cause the handles to jump.
	const makeHandleDragHandler = useCallback(
		(isStartHandle: boolean) => (e: React.PointerEvent<HTMLDivElement>) => {
			e.preventDefault();
			const target = e.currentTarget;
			target.style.pointerEvents = "none"; // transparent to elementFromPoint during drag
			const anchor = selectionAnchorRef.current ?? 0;
			const end = selectionEndRef.current ?? 0;
			// Does `anchor` currently hold the edge we're dragging?
			const anchorHoldsDraggedEdge = isStartHandle ? anchor <= end : anchor >= end;
			const onMove = (me: PointerEvent) => {
				const el = document.elementFromPoint(me.clientX, me.clientY);
				const span = el?.closest<HTMLElement>("span[data-word]");
				if (!span) return;
				const wIdx = Number.parseInt(span.dataset.word ?? "", 10);
				if (Number.isNaN(wIdx)) return;
				if (anchorHoldsDraggedEdge) writeAnchor(wIdx);
				else writeEnd(wIdx);
			};
			const cleanup = () => {
				target.style.pointerEvents = "";
				window.removeEventListener("pointermove", onMove);
				window.removeEventListener("pointerup", cleanup);
				window.removeEventListener("pointercancel", cleanup);
			};
			window.addEventListener("pointermove", onMove);
			window.addEventListener("pointerup", cleanup);
			window.addEventListener("pointercancel", cleanup);
		},
		[writeAnchor, writeEnd],
	);

	const handleStartHandlePointerDown = useMemo(
		() => makeHandleDragHandler(true),
		[makeHandleDragHandler],
	);
	const handleEndHandlePointerDown = useMemo(
		() => makeHandleDragHandler(false),
		[makeHandleDragHandler],
	);

	// ── Selection auto-save - triggered when the user picks a color ──────
	// First pick: creates the highlight. Subsequent picks: update color.
	// Toolbar stays open after saving so the user can adjust or add a note.
	// charInWord is fixed at 0: selection handles snap to whole-word boundaries
	// so intra-word offsets are always zero at runtime. The DB column stays for
	// a future sub-word selection feature.
	const handleSelectionColorChange = useCallback(
		(newColor: HighlightColor) => {
			setSelectionColor(newColor);
			if (!selectionRange || !bookId) return;
			const now = Date.now();
			if (selectionSavedId) {
				updateHighlightMutation.mutate({
					id: selectionSavedId,
					bookId,
					data: { color: newColor, updatedAt: now },
				});
			} else {
				const newId = randomHexId();
				setSelectionSavedId(newId);
				const snippet = extractRangeText(selectionRange.startWord, selectionRange.endWord) || null;
				addHighlightMutation.mutate({
					id: newId,
					bookId,
					startWord: wordPos(selectionRange.startWord),
					startCharInWord: 0,
					endWord: wordPos(selectionRange.endWord),
					endCharInWord: 0,
					color: newColor,
					note: pendingNote || null,
					text: snippet,
					createdAt: now,
					updatedAt: now,
				});
			}
		},
		[
			selectionRange,
			selectionSavedId,
			pendingNote,
			bookId,
			extractRangeText,
			addHighlightMutation,
			updateHighlightMutation,
		],
	);

	// ── Note save - called when the note modal closes ─────────────────────
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

	// ── Highlight save (from edit modal) ──────────────────────────────────
	const handleHighlightSave = useCallback(
		(highlightId: string, color: string, note: string) => {
			updateHighlightMutation.mutate({
				id: highlightId,
				bookId,
				data: { color, note: note || null, updatedAt: Date.now() },
			});
		},
		[bookId, updateHighlightMutation],
	);

	// ── Highlight delete ──────────────────────────────────────────────────
	const handleHighlightDelete = useCallback(
		(highlightId: string) => {
			deleteHighlightMutation.mutate(
				{ id: highlightId, bookId },
				{ onSuccess: () => toast.info("Highlight removed") },
			);
		},
		[bookId, deleteHighlightMutation],
	);

	return {
		// Render state
		selectionRange,
		isSelecting,
		selectionColor,
		pendingNote,
		setPendingNote,
		noteInputOpen,
		setNoteInputOpen,
		editingHighlight,
		editingHighlightText,
		setEditingHighlight,
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
		handleSelectionColorChange,
		handleSelectionNoteDone,
		handleHighlightSave,
		handleHighlightDelete,
	};
}
