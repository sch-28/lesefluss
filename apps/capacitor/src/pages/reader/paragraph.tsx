/**
 * Paragraph - renders a single paragraph as inline <span> elements.
 *
 * Each rendered word's `data-word` attribute is the absolute canonical word
 * index from the WordIndex (ADR-0002). The parent slices `entries` per
 * paragraph; the component never tokenises text on its own. This keeps the
 * DOM aligned with `wordIndex.wordOf(byteOffset)` lookups so scroll-position
 * alignment and tap handling cannot drift from the canonical stream.
 *
 * Headings (lines prefixed with #) are rendered as styled block elements
 * without per-word spans - they are not tappable reading positions.
 */

import type { WordPosition } from "@lesefluss/core";
import type React from "react";
import { memo } from "react";

export function getHeadingLevel(text: string): number {
	const m = text.match(/^(#{1,6}) /);
	return m ? m[1].length : 0;
}

function stripHeadingPrefix(text: string): string {
	return text.replace(/^#{1,6} /, "");
}

export interface HighlightRange {
	id: string;
	startWord: WordPosition;
	endWord: WordPosition;
	color: string;
}

export interface GlossaryRangeProp {
	entryId: string;
	startWord: WordPosition;
	endWord: WordPosition;
	color: string;
	label: string;
	hideMarker?: boolean;
}

/**
 * One canonical word's slot in the paragraph text. `charStart`..`charEnd`
 * covers the word plus any trailing whitespace before the next word. The
 * trailing whitespace is rendered separately so highlight backgrounds extend
 * across spaces between two in-range words.
 */
export interface ParagraphWordEntry {
	charStart: number;
	charEnd: number;
	wordIndex: WordPosition;
}

export interface ParagraphProps {
	text: string;
	entries: readonly ParagraphWordEntry[];
	activeWord: number;
	onWordTap: (wordIdx: number, wordText: string) => void;
	onWordLongPress?: (wordIdx: number) => void;
	onWordMouseDragStart?: (wordIdx: number, event: PointerEvent) => void;
	highlights?: HighlightRange[];
	glossaryRanges?: GlossaryRangeProp[];
	selectionRange?: { startWord: number; endWord: number } | null;
	showActiveWordUnderline: boolean;
}

export const LONG_PRESS_MS = 400;

// Module-level: at most one long-press timer is active at a time.
let _cancelActiveLongPress: (() => void) | null = null;

export function cancelAnyActiveLongPress(): void {
	_cancelActiveLongPress?.();
	_cancelActiveLongPress = null;
}

function wordInRange(wIdx: number, s: number, e: number): boolean {
	return wIdx >= s && wIdx <= e;
}

function spaceAfterInRange(prevWordIdx: number, s: number, e: number): boolean {
	return prevWordIdx >= s && prevWordIdx < e;
}

/** Position past the last non-whitespace char of `text.slice(start, end)`. */
function trimEnd(text: string, start: number, end: number): number {
	let i = end;
	while (i > start) {
		const c = text.charCodeAt(i - 1);
		if (c !== 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d && c !== 0x0c && c !== 0x0b) break;
		i--;
	}
	return i;
}

const Paragraph: React.FC<ParagraphProps> = memo(
	({
		text,
		entries,
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

		const children: React.ReactNode[] = [];

		if (entries.length > 0 && entries[0].charStart > 0) {
			children.push(text.slice(0, entries[0].charStart));
		}

		for (let k = 0; k < entries.length; k++) {
			const e = entries[k];
			const wordEnd = trimEnd(text, e.charStart, e.charEnd);
			const wordText = text.slice(e.charStart, wordEnd);
			const trailingWhitespace = wordEnd < e.charEnd ? text.slice(wordEnd, e.charEnd) : "";
			const wIdx = e.wordIndex;

			const wordClasses: string[] = [];
			if (wIdx === activeWord && showActiveWordUnderline) wordClasses.push("word-active");

			if (highlights) {
				for (const h of highlights) {
					if (wordInRange(wIdx, h.startWord, h.endWord)) {
						wordClasses.push(`word-highlight-${h.color}`);
						break;
					}
				}
			}

			if (
				selectionRange &&
				wordInRange(wIdx, selectionRange.startWord, selectionRange.endWord)
			) {
				wordClasses.push("word-selecting");
			}

			let glossaryAvatar: { label: string; color: string } | null = null;
			if (glossaryRanges) {
				for (const g of glossaryRanges) {
					if (wIdx === g.startWord && !g.hideMarker) {
						glossaryAvatar = { label: g.label, color: g.color };
						break;
					}
				}
			}

			const handlePointerDown =
				onWordLongPress || onWordMouseDragStart
					? (ev: React.PointerEvent) => {
							const pointerType = ev.pointerType;
							if (pointerType === "mouse") ev.preventDefault();
							let longPressTimer: ReturnType<typeof setTimeout> | null = null;
							const startX = ev.clientX;
							const startY = ev.clientY;
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
									// Swallow the trailing click from the same pointer
									// sequence so handleWordTap doesn't cancel the just-
									// started selection.
									const swallow = (ce: MouseEvent) => {
										ce.stopPropagation();
										ce.preventDefault();
									};
									window.addEventListener("click", swallow, {
										once: true,
										capture: true,
									});
								}, LONG_PRESS_MS);
							}
							document.addEventListener("pointermove", onMove);
							document.addEventListener("pointerup", cleanup);
							document.addEventListener("pointercancel", cleanup);
						}
					: undefined;

			let wordChildren: React.ReactNode = wordText;
			if (glossaryAvatar) {
				const matchIdx = wordText.toLowerCase().indexOf(glossaryAvatar.label.toLowerCase());
				const prefix = matchIdx > 0 ? wordText.slice(0, matchIdx) : "";
				const rest = matchIdx > 0 ? wordText.slice(matchIdx) : wordText;
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
					key={`w${k}`}
					data-word={wIdx}
					className={wordClasses.length > 0 ? wordClasses.join(" ") : undefined}
					onClick={() => onWordTap(wIdx, wordText)}
					onPointerDown={handlePointerDown}
				>
					{wordChildren}
				</span>
			);

			if (glossaryAvatar) {
				children.push(
					<span key={`gg${k}`} className="glossary-marker-group">
						{wordSpan}
					</span>,
				);
			} else {
				children.push(wordSpan);
			}

			if (trailingWhitespace.length > 0) {
				const spaceClasses: string[] = [];
				if (highlights) {
					for (const h of highlights) {
						if (spaceAfterInRange(wIdx, h.startWord, h.endWord)) {
							spaceClasses.push(`word-highlight-${h.color}`);
							break;
						}
					}
				}
				if (
					selectionRange &&
					spaceAfterInRange(wIdx, selectionRange.startWord, selectionRange.endWord)
				) {
					spaceClasses.push("word-selecting");
				}
				if (spaceClasses.length > 0) {
					children.push(
						<span key={`s${k}`} className={spaceClasses.join(" ")}>
							{trailingWhitespace}
						</span>,
					);
				} else {
					children.push(trailingWhitespace);
				}
			}
		}

		if (entries.length === 0) {
			return <p className="reader-paragraph">{text}</p>;
		}

		const lastEnd = entries[entries.length - 1].charEnd;
		if (lastEnd < text.length) {
			children.push(text.slice(lastEnd));
		}

		return <p className="reader-paragraph">{children}</p>;
	},
);

export default Paragraph;
