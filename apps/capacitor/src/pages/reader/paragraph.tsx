/**
 * Paragraph - renders a single paragraph as inline <span> elements.
 *
 * Byte offsets are computed locally from `startOffset` - no pre-built word
 * index needed. Only ~20–30 of these exist in the DOM at any time (virtua).
 *
 * Wrapped in React.memo: only the paragraph whose activeOffset range changed
 * will re-render on scroll, instead of all ~25 visible paragraphs.
 *
 * Headings (lines prefixed with #) are rendered as styled block elements
 * without per-word spans - they are not tappable reading positions.
 */

import { utf8ByteLength } from "@lesefluss/rsvp-core";
import type React from "react";
import { memo } from "react";

export { utf8ByteLength };

// ─── Heading helpers ─────────────────────────────────────────────────────────

/** Returns the heading level (1–6) if the paragraph starts with # markers, else 0. */
export function getHeadingLevel(text: string): number {
	const m = text.match(/^(#{1,6}) /);
	return m ? m[1].length : 0;
}

/** Strip the leading `# ` prefix from a heading paragraph. */
function stripHeadingPrefix(text: string): string {
	return text.replace(/^#{1,6} /, "");
}

// ─── Word offset helpers ─────────────────────────────────────────────────────

/**
 * Returns the **UTF-8 byte** offsets of every word (non-whitespace token) in
 * `text`, relative to `startOffset`. Uses the same split logic as the render
 * path so offsets always match the `data-offset` attributes on rendered spans.
 *
 * We must use UTF-8 byte lengths (not JS `.length`) because the ESP32 tracks
 * position as a byte offset into the file. For any non-ASCII character (smart
 * quotes, em-dashes, accented letters, etc.) JS `.length` and UTF-8 byte
 * length diverge, causing the reading position to drift.
 */
export function getWordOffsets(text: string, startOffset: number): number[] {
	const tokens = text.split(/(\s+)/);
	const offsets: number[] = [];
	let localByteOffset = 0;
	for (const token of tokens) {
		if (!/^\s+$/.test(token)) {
			offsets.push(startOffset + localByteOffset);
		}
		localByteOffset += utf8ByteLength(token);
	}
	return offsets;
}

// ─── Highlight types ─────────────────────────────────────────────────────────

export interface HighlightRange {
	id: string;
	startOffset: number;
	endOffset: number;
	color: string;
}

/** Inline glossary underline range — same byte-offset semantics as HighlightRange. */
export interface GlossaryRangeProp {
	entryId: string;
	startOffset: number;
	endOffset: number;
	color: string;
	label: string;
	hideMarker?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export interface ParagraphProps {
	text: string;
	startOffset: number;
	activeOffset: number;
	onWordTap: (offset: number, wordText: string) => void;
	onWordLongPress?: (offset: number) => void;
	/** Mouse-only: fires when a mouse drag starts on a word (pointerdown + move > 8px).
	 *  Desktop equivalent of long-press - lets users click-drag to select words.
	 *  The pointer event that triggered the threshold is passed through so the
	 *  reader can extend the selection to the cursor's current position (the drag
	 *  has already moved past the start word by the time this fires). */
	onWordMouseDragStart?: (offset: number, event: PointerEvent) => void;
	highlights?: HighlightRange[];
	glossaryRanges?: GlossaryRangeProp[];
	selectionRange?: { start: number; end: number } | null;
	showActiveWordUnderline: boolean;
}

// How long (ms) a pointer must be held before triggering long-press
export const LONG_PRESS_MS = 400;

// Module-level: at most one long-press timer is active at a time (one finger).
// The reader's scroll handler calls this to cancel if the user starts scrolling.
let _cancelActiveLongPress: (() => void) | null = null;

export function cancelAnyActiveLongPress(): void {
	_cancelActiveLongPress?.();
	_cancelActiveLongPress = null;
}

const Paragraph: React.FC<ParagraphProps> = memo(
	({
		text,
		startOffset,
		activeOffset,
		onWordTap,
		onWordLongPress,
		onWordMouseDragStart,
		highlights,
		glossaryRanges,
		selectionRange,
		showActiveWordUnderline,
	}) => {
		const headingLevel = getHeadingLevel(text);

		if (headingLevel > 0) {
			const headingText = stripHeadingPrefix(text);
			const Tag: React.ElementType = headingLevel === 1 ? "h2" : "h3";
			return <Tag className={`reader-heading reader-heading-${headingLevel}`}>{headingText}</Tag>;
		}

		// Split on whitespace, keeping the separators so we can track byte offsets.
		// Example: "Hello world" → ["Hello", " ", "world"]
		const tokens = text.split(/(\s+)/);

		let localByteOffset = 0;
		const spans: React.ReactNode[] = [];

		for (let i = 0; i < tokens.length; i++) {
			const token = tokens[i];
			const tokenOffset = startOffset + localByteOffset;
			localByteOffset += utf8ByteLength(token);

			const isSpace = /^\s+$/.test(token);

			// Build className for both words and spaces.
			// Spaces between selected/highlighted words get the same background so
			// the visual range looks continuous rather than dotted.
			const classes: string[] = [];

			if (!isSpace && tokenOffset === activeOffset && showActiveWordUnderline) {
				classes.push("word-active");
			}

			// Highlight ranges - same check for words and spaces
			if (highlights) {
				for (const h of highlights) {
					if (tokenOffset >= h.startOffset && tokenOffset <= h.endOffset) {
						classes.push(`word-highlight-${h.color}`);
						break;
					}
				}
			}

			// Glossary ranges — render a small inline avatar before the FIRST token of
			// each range instead of underlining every word. Less visual noise when
			// many entries are tracked. `hideMarker` (legacy name) still suppresses
			// the marker. Range stays in glossaryByParagraph so the tap target is
			// preserved on the words themselves.
			let glossaryAvatar: { label: string; color: string } | null = null;
			if (glossaryRanges && !isSpace) {
				for (const g of glossaryRanges) {
					if (tokenOffset === g.startOffset && !g.hideMarker) {
						glossaryAvatar = { label: g.label, color: g.color };
						break;
					}
				}
			}

			// Active selection - same check for words and spaces
			if (
				selectionRange &&
				tokenOffset >= selectionRange.start &&
				tokenOffset <= selectionRange.end
			) {
				classes.push("word-selecting");
			}

			if (isSpace) {
				if (classes.length > 0) {
					spans.push(
						<span key={i} className={classes.join(" ")}>
							{token}
						</span>,
					);
				} else {
					spans.push(token);
				}
				continue;
			}

			const className = classes.length > 0 ? classes.join(" ") : undefined;

			// Long-press / mouse-drag detection via pointer events.
			// Touch / pen: fires onWordLongPress if the pointer stays down ≥ LONG_PRESS_MS
			// without significant movement (> 8px cancels).
			// Mouse: fires onWordMouseDragStart the moment movement exceeds 8px -
			// click-drag is the natural desktop equivalent of long-press. A plain click
			// (no movement) falls through to onClick → dictionary.
			const handlePointerDown =
				onWordLongPress || onWordMouseDragStart
					? (e: React.PointerEvent) => {
							const pointerType = e.pointerType;
							// Prevent the browser from starting a native text selection on mouse
							// drag. Click still fires, so dictionary lookup on plain clicks works.
							if (pointerType === "mouse") e.preventDefault();
							let longPressTimer: ReturnType<typeof setTimeout> | null = null;
							const startX = e.clientX;
							const startY = e.clientY;
							const cleanup = () => {
								if (longPressTimer) {
									clearTimeout(longPressTimer);
									longPressTimer = null;
								}
								_cancelActiveLongPress = null;
								document.removeEventListener("pointermove", onMove);
								document.removeEventListener("pointerup", cleanup);
								document.removeEventListener("pointercancel", cleanup);
							};
							const onMove = (me: PointerEvent) => {
								const dx = Math.abs(me.clientX - startX);
								const dy = Math.abs(me.clientY - startY);
								if (dx > 8 || dy > 8) {
									if (pointerType === "mouse" && onWordMouseDragStart) {
										// Mouse-drag: start selection immediately (skip long-press timer).
										cleanup();
										onWordMouseDragStart(tokenOffset, me);
									} else {
										cleanup();
									}
								}
							};
							if (pointerType !== "mouse" && onWordLongPress) {
								// Register so the scroll handler can cancel this from outside
								_cancelActiveLongPress = cleanup;
								longPressTimer = setTimeout(() => {
									_cancelActiveLongPress = null;
									longPressTimer = null;
									onWordLongPress(tokenOffset);
								}, LONG_PRESS_MS);
							}
							document.addEventListener("pointermove", onMove);
							document.addEventListener("pointerup", cleanup);
							document.addEventListener("pointercancel", cleanup);
						}
					: undefined;

			if (glossaryAvatar) {
				spans.push(
					<span
						key={`g-${i}`}
						className="glossary-inline-avatar"
						style={{ background: glossaryAvatar.color }}
						aria-hidden="true"
					>
						{(glossaryAvatar.label.trim()[0] ?? "?").toUpperCase()}
					</span>,
				);
			}

			spans.push(
				<span
					key={i}
					data-offset={tokenOffset}
					className={className}
					onClick={() => onWordTap(tokenOffset, token)}
					onPointerDown={handlePointerDown}
				>
					{token}
				</span>,
			);
		}

		return <p className="reader-paragraph">{spans}</p>;
	},
);

export default Paragraph;
