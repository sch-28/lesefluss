/**
 * Paragraph - renders a single paragraph as inline <span> elements.
 *
 * Positions are word indices (ADR-0002). The paragraph receives the word
 * index of its first word; each non-space token increments a local counter
 * so word-unit comparisons (active, highlight, glossary, selection) match
 * against per-token word index.
 *
 * Wrapped in React.memo: only the paragraph whose activeWord range changed
 * will re-render on scroll, instead of all ~25 visible paragraphs.
 *
 * Headings (lines prefixed with #) are rendered as styled block elements
 * without per-word spans - they are not tappable reading positions.
 */

import type { WordPosition } from "@lesefluss/core";
import type React from "react";
import { memo } from "react";

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

// ─── Highlight types ─────────────────────────────────────────────────────────

export interface HighlightRange {
	id: string;
	startWord: WordPosition;
	endWord: WordPosition;
	color: string;
}

/** Inline glossary underline range — word-index span on this paragraph. */
export interface GlossaryRangeProp {
	entryId: string;
	startWord: WordPosition;
	endWord: WordPosition;
	color: string;
	label: string;
	hideMarker?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export interface ParagraphProps {
	text: string;
	/** Word index of the FIRST word in this paragraph (ADR-0002). */
	startWord: number;
	/** Currently focused word index, or -1 to hide the active-word underline. */
	activeWord: number;
	onWordTap: (wordIdx: number, wordText: string) => void;
	onWordLongPress?: (wordIdx: number) => void;
	/** Mouse-only: fires when a mouse drag starts on a word (pointerdown + move > 8px).
	 *  Desktop equivalent of long-press - lets users click-drag to select words. */
	onWordMouseDragStart?: (wordIdx: number, event: PointerEvent) => void;
	highlights?: HighlightRange[];
	glossaryRanges?: GlossaryRangeProp[];
	selectionRange?: { startWord: number; endWord: number } | null;
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
		startWord,
		activeWord,
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

		// Split on whitespace, keeping the separators so we can track positions.
		// Example: "Hello world" → ["Hello", " ", "world"]
		const tokens = text.split(/(\s+)/);

		// Word index of the last word emitted (or startWord - 1 before the first).
		// Whitespace tokens use this to test whether they sit between two words
		// both inside a range, in which case they get the same background to keep
		// the visual range continuous.
		let lastWordIdx = startWord - 1;
		const spans: React.ReactNode[] = [];

		const wordInRange = (wIdx: number, s: number, e: number) => wIdx >= s && wIdx <= e;
		const spaceInRange = (lastW: number, s: number, e: number) => lastW >= s && lastW < e;

		for (let i = 0; i < tokens.length; i++) {
			const token = tokens[i];
			if (token.length === 0) continue;
			const isSpace = /^\s+$/.test(token);

			const tokenWord = isSpace ? lastWordIdx : lastWordIdx + 1;
			if (!isSpace) lastWordIdx = tokenWord;

			const classes: string[] = [];

			if (!isSpace && tokenWord === activeWord && showActiveWordUnderline) {
				classes.push("word-active");
			}

			if (highlights) {
				for (const h of highlights) {
					const hit = isSpace
						? spaceInRange(tokenWord, h.startWord, h.endWord)
						: wordInRange(tokenWord, h.startWord, h.endWord);
					if (hit) {
						classes.push(`word-highlight-${h.color}`);
						break;
					}
				}
			}

			// Glossary ranges — render a small inline avatar before the FIRST
			// token of each range instead of underlining every word. `hideMarker`
			// suppresses the marker; range stays so the tap target is preserved.
			let glossaryAvatar: { label: string; color: string } | null = null;
			if (glossaryRanges && !isSpace) {
				for (const g of glossaryRanges) {
					if (tokenWord === g.startWord && !g.hideMarker) {
						glossaryAvatar = { label: g.label, color: g.color };
						break;
					}
				}
			}

			if (selectionRange) {
				const hit = isSpace
					? spaceInRange(tokenWord, selectionRange.startWord, selectionRange.endWord)
					: wordInRange(tokenWord, selectionRange.startWord, selectionRange.endWord);
				if (hit) classes.push("word-selecting");
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
			const wIdx = tokenWord;

			const handlePointerDown =
				onWordLongPress || onWordMouseDragStart
					? (e: React.PointerEvent) => {
							const pointerType = e.pointerType;
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
										cleanup();
										onWordMouseDragStart(wIdx, me);
									} else {
										cleanup();
									}
								}
							};
							if (pointerType !== "mouse" && onWordLongPress) {
								_cancelActiveLongPress = cleanup;
								longPressTimer = setTimeout(() => {
									_cancelActiveLongPress = null;
									longPressTimer = null;
									onWordLongPress(wIdx);
								}, LONG_PRESS_MS);
							}
							document.addEventListener("pointermove", onMove);
							document.addEventListener("pointerup", cleanup);
							document.addEventListener("pointercancel", cleanup);
						}
					: undefined;

			let wordChildren: React.ReactNode = token;
			if (glossaryAvatar) {
				const matchIdx = token.toLowerCase().indexOf(glossaryAvatar.label.toLowerCase());
				const prefix = matchIdx > 0 ? token.slice(0, matchIdx) : "";
				const rest = matchIdx > 0 ? token.slice(matchIdx) : token;
				wordChildren = (
					<>
						{prefix}
						<span
							className="glossary-inline-avatar"
							style={{ background: glossaryAvatar.color }}
							aria-hidden="true"
						>
							{(glossaryAvatar.label.trim()[0] ?? "?").toUpperCase()}
						</span>
						{rest}
					</>
				);
			}

			const wordSpan = (
				<span
					key={i}
					data-word={wIdx}
					className={className}
					onClick={() => onWordTap(wIdx, token)}
					onPointerDown={handlePointerDown}
				>
					{wordChildren}
				</span>
			);

			if (glossaryAvatar) {
				spans.push(
					<span key={`gg-${i}`} className="glossary-marker-group">
						{wordSpan}
					</span>,
				);
			} else {
				spans.push(wordSpan);
			}
		}

		return <p className="reader-paragraph">{spans}</p>;
	},
);

export default Paragraph;
