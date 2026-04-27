/**
 * useHighlightSelection - owns all highlight + selection state for the reader.
 *
 * Covers: the selection-mode state machine (anchor/end/color/note), the floating
 * toolbar + two drag handles, the edit-existing-highlight modal, and the list modal.
 *
 * The reader passes raw data in (contentBytes, highlightRows, paragraphOffsets) and
 * wires the returned handlers/refs to word events + overlay JSX.
 */

import type React from "react";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "../../components/toast";
import { queryHooks } from "../../services/db/hooks";
import type { Highlight } from "../../services/db/schema";
import type { HighlightRange } from "./paragraph";
import type { HighlightColor } from "./selection-toolbar";

const _decoder = new TextDecoder();

// Must match .selection-toolbar height in monochrome.css
const SELECTION_TOOLBAR_H = 48;
// Must match .selection-handle width and padding in monochrome.css
const HANDLE_WIDTH = 44;
const HANDLE_V_PAD = 10;
const HANDLE_H_HALF = HANDLE_WIDTH / 2;

function randomHexId(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(4)))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

interface Params {
	bookId: string;
	contentBytes: Uint8Array | null;
	highlightRows: Highlight[];
	paragraphOffsets: number[];
}

export function useHighlightSelection({
	bookId,
	contentBytes,
	highlightRows,
	paragraphOffsets,
}: Params) {
	// ── Mutations ─────────────────────────────────────────────────────────
	const addHighlightMutation = queryHooks.useAddHighlight();
	const updateHighlightMutation = queryHooks.useUpdateHighlight();
	const deleteHighlightMutation = queryHooks.useDeleteHighlight();

	// ── Edit modal state ──────────────────────────────────────────────────
	const [editingHighlight, setEditingHighlight] = useState<Highlight | null>(null);
	const [editingHighlightText, setEditingHighlightText] = useState("");

	// ── Selection state ───────────────────────────────────────────────────
	// selectionAnchor: byte offset of the word where selection started (null = not selecting)
	// selectionEnd:    byte offset of the current drag end
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
	const writeAnchor = useCallback((offset: number | null) => {
		selectionAnchorRef.current = offset;
		setSelectionAnchor(offset);
	}, []);
	const writeEnd = useCallback((offset: number | null) => {
		selectionEndRef.current = offset;
		setSelectionEnd(offset);
	}, []);

	// Derived: the active selection range (start <= end, both defined)
	const selectionRange = useMemo(() => {
		if (selectionAnchor === null || selectionEnd === null) return null;
		return {
			start: Math.min(selectionAnchor, selectionEnd),
			end: Math.max(selectionAnchor, selectionEnd),
		};
	}, [selectionAnchor, selectionEnd]);

	// ── Per-paragraph highlight map ───────────────────────────────────────
	// Maps paragraphIndex → HighlightRange[] that overlap that paragraph.
	// Recomputed only when highlights or paragraph offsets change (not on scroll).
	const highlightsByParagraph = useMemo<Map<number, HighlightRange[]>>(() => {
		const map = new Map<number, HighlightRange[]>();
		if (highlightRows.length === 0 || paragraphOffsets.length === 0) return map;

		for (const h of highlightRows) {
			for (let i = 0; i < paragraphOffsets.length; i++) {
				const paraStart = paragraphOffsets[i];
				const paraEnd =
					i + 1 < paragraphOffsets.length
						? paragraphOffsets[i + 1] - 2 // -2 for the "\n\n"
						: Number.POSITIVE_INFINITY;
				if (h.startOffset <= paraEnd && h.endOffset >= paraStart) {
					const existing = map.get(i);
					if (existing) {
						existing.push(h);
					} else {
						map.set(i, [h]);
					}
				}
			}
		}
		return map;
	}, [highlightRows, paragraphOffsets]);

	// ── Text extraction + highlight lookup ────────────────────────────────
	const extractRangeText = useCallback(
		(startOffset: number, endOffset: number): string => {
			if (!contentBytes) return "";
			// Scan forward from endOffset to end of the last word
			let end = endOffset;
			while (end < contentBytes.length && contentBytes[end] !== 32 && contentBytes[end] !== 10) {
				end++;
			}
			return _decoder.decode(contentBytes.slice(startOffset, end)).replace(/\s+/g, " ").trim();
		},
		[contentBytes],
	);

	const findHighlightAt = useCallback(
		(offset: number): Highlight | undefined => {
			return highlightRows.find((h) => offset >= h.startOffset && offset <= h.endOffset);
		},
		[highlightRows],
	);

	/** Open the edit modal for a known highlight. */
	const openHighlightEditor = useCallback(
		(highlight: Highlight) => {
			setEditingHighlight(highlight);
			setEditingHighlightText(extractRangeText(highlight.startOffset, highlight.endOffset));
		},
		[extractRangeText],
	);

	/** Enter selection mode anchored at `offset` (both anchor + end). */
	const startSelection = useCallback(
		(offset: number) => {
			writeAnchor(offset);
			writeEnd(offset);
			setSelectionSavedId(null);
			setSelectionColor(null);
			setPendingNote("");
		},
		[writeAnchor, writeEnd],
	);

	/** Long-press on a word: open editor if highlighted, else start selection. */
	const handleWordLongPress = useCallback(
		(offset: number) => {
			const existing = findHighlightAt(offset);
			if (existing) {
				openHighlightEditor(existing);
				return;
			}
			startSelection(offset);
		},
		[findHighlightAt, openHighlightEditor, startSelection],
	);

	/** Extend the current selection's end to a new offset. No-op if not selecting. */
	const extendSelectionTo = useCallback(
		(offset: number) => {
			if (selectionAnchorRef.current === null) return;
			writeEnd(offset);
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
			`span[data-offset="${selectionRange.start}"]`,
		);
		const endSpan = document.querySelector<HTMLElement>(
			`span[data-offset="${selectionRange.end}"]`,
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
	// `isStartHandle=true`  → we're dragging the min-offset boundary
	// `isStartHandle=false` → we're dragging the max-offset boundary
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
				const span = el?.closest<HTMLElement>("span[data-offset]");
				if (!span) return;
				const offset = Number.parseInt(span.dataset.offset ?? "", 10);
				if (Number.isNaN(offset)) return;
				if (anchorHoldsDraggedEdge) writeAnchor(offset);
				else writeEnd(offset);
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
				const snippet = contentBytes
					? _decoder.decode(contentBytes.subarray(selectionRange.start, selectionRange.end))
					: null;
				addHighlightMutation.mutate({
					id: newId,
					bookId,
					startOffset: selectionRange.start,
					endOffset: selectionRange.end,
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
			contentBytes,
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
