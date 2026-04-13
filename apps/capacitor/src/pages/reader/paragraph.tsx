/**
 * Paragraph — renders a single paragraph as inline <span> elements.
 *
 * Byte offsets are computed locally from `startOffset` — no pre-built word
 * index needed. Only ~20–30 of these exist in the DOM at any time (virtua).
 *
 * Wrapped in React.memo: only the paragraph whose activeOffset range changed
 * will re-render on scroll, instead of all ~25 visible paragraphs.
 *
 * Headings (lines prefixed with #) are rendered as styled block elements
 * without per-word spans — they are not tappable reading positions.
 */

import type React from "react";
import { memo } from "react";
import { utf8ByteLength } from "./utf8";
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

// ─── Component ───────────────────────────────────────────────────────────────

export interface ParagraphProps {
	text: string;
	startOffset: number;
	activeOffset: number;
	onWordTap: (offset: number, wordText: string) => void;
}

const Paragraph: React.FC<ParagraphProps> = memo(
	({ text, startOffset, activeOffset, onWordTap }) => {
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

			if (/^\s+$/.test(token)) {
				spans.push(token);
				continue;
			}

			const isActive = tokenOffset === activeOffset;
			spans.push(
				<span
					key={i}
					data-offset={tokenOffset}
					className={isActive ? "word-active" : undefined}
					onClick={() => onWordTap(tokenOffset, token)}
				>
					{token}
				</span>,
			);
		}

		return <p className="reader-paragraph">{spans}</p>;
	},
);

export default Paragraph;
