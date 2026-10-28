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
 *
 * The spans carry no handlers: word-gestures.ts routes taps and long presses
 * by `data-word` from document, which keeps paragraphs plain text to TalkBack.
 */

import type { WordPosition } from "@lesefluss/core";
import type React from "react";
import { memo } from "react";
import { GoalDivider, type GoalDividerProp } from "./goal-divider";
import { renderFigures } from "./reader-figure";
import type { ReaderFigureData } from "./reader-figures";

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

export interface LinkRangeProp {
	startWord: number;
	endWord: number;
	href: string;
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
	highlights?: HighlightRange[];
	glossaryRanges?: GlossaryRangeProp[];
	links?: LinkRangeProp[];
	selectionRange?: { startWord: number; endWord: number } | null;
	showActiveWordUnderline: boolean;
	/** Title rendered as a chapter heading above this paragraph. Set only for the
	 *  first paragraph of a TOC chapter that has no heading of its own (e.g. EPUBs
	 *  whose chapter titles were images). Lets the reader show a header at a TOC
	 *  jump without re-importing the book. */
	chapterHeading?: string;
	/** Body images anchored to this paragraph, rendered above it. */
	figures?: ReaderFigureData[];
	/** Unlocked buddy-read discussion items anchored in this paragraph. */
	discussion?: { count: number; onTap: () => void };
	/** Today's reading-goal target ends in this paragraph. */
	goalDivider?: GoalDividerProp;
	/** In a page-mode chunk pre-mounted off screen: its controls leave the focus order. */
	isOffscreen?: boolean;
}

function withLeading(
	figures: ReaderFigureData[] | undefined,
	title: string | undefined,
	body: React.ReactElement,
): React.ReactElement {
	if (!title && !figures?.length) return body;
	return (
		<>
			{renderFigures(figures)}
			{title && <h2 className="reader-heading reader-heading-1 reader-chapter-heading">{title}</h2>}
			{body}
		</>
	);
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
		highlights,
		glossaryRanges,
		links,
		selectionRange,
		showActiveWordUnderline,
		chapterHeading,
		figures,
		discussion,
		goalDivider,
		isOffscreen,
	}) => {
		const headingLevel = getHeadingLevel(text);

		if (headingLevel > 0) {
			const headingText = stripHeadingPrefix(text);
			const Tag: React.ElementType = headingLevel === 1 ? "h2" : "h3";
			return withLeading(
				figures,
				undefined,
				// Headings render without word spans; this lets a reflow re-anchor onto one.
				<Tag
					className={`reader-heading reader-heading-${headingLevel}`}
					data-heading-word={entries[0]?.wordIndex}
				>
					{headingText}
				</Tag>,
			);
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

			if (selectionRange && wordInRange(wIdx, selectionRange.startWord, selectionRange.endWord)) {
				wordClasses.push("word-selecting");
			}

			if (links) {
				for (const l of links) {
					if (wordInRange(wIdx, l.startWord, l.endWord)) {
						wordClasses.push("word-link");
						break;
					}
				}
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
				if (links) {
					for (const l of links) {
						if (spaceAfterInRange(wIdx, l.startWord, l.endWord)) {
							spaceClasses.push("word-link");
							break;
						}
					}
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

		const commentsLabel = discussion?.count === 1 ? "1 comment" : `${discussion?.count} comments`;
		// The visible marker sits inline in the text but stays out of the a11y tree:
		// Android reads a paragraph as one node only when all its children are text.
		// Screen readers and keyboards get the sibling button after the paragraph.
		const marker = discussion ? (
			<button
				type="button"
				className="reader-discussion-marker"
				aria-hidden="true"
				tabIndex={-1}
				// Swallowed here so the tap opens the thread instead of moving the reader.
				onPointerDown={(e) => e.stopPropagation()}
				onPointerUp={(e) => e.stopPropagation()}
				onClick={(e) => {
					e.stopPropagation();
					discussion.onTap();
				}}
			>
				💬 {discussion.count}
			</button>
		) : null;
		const accessibleMarker = discussion ? (
			<button
				type="button"
				className="reader-discussion-sr sr-only"
				tabIndex={isOffscreen ? -1 : undefined}
				onClick={discussion.onTap}
			>
				{commentsLabel}
			</button>
		) : null;

		const divider = goalDivider ? <GoalDivider {...goalDivider} /> : null;
		const paragraphClass = goalDivider
			? "reader-paragraph reader-paragraph--goal"
			: "reader-paragraph";

		if (entries.length === 0) {
			return withLeading(
				figures,
				chapterHeading,
				<>
					<p className={paragraphClass}>
						{text}
						{marker}
						{divider}
					</p>
					{accessibleMarker}
				</>,
			);
		}

		const lastEnd = entries[entries.length - 1].charEnd;
		if (lastEnd < text.length) {
			children.push(text.slice(lastEnd));
		}

		return withLeading(
			figures,
			chapterHeading,
			<>
				<p className={paragraphClass}>
					{children}
					{marker}
					{divider}
				</p>
				{accessibleMarker}
			</>,
		);
	},
);

export default Paragraph;
