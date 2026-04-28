/**
 * Compute glossary inline-underline decorations per paragraph.
 *
 * Mirrors the shape of `highlightsByParagraph` in use-highlight-selection.ts:
 * a Map<paragraphIndex, GlossaryRange[]> consumed by Paragraph.tsx. Each range
 * is byte-offset based so the existing per-token byte-offset comparison applies.
 *
 * Builds one combined alternation regex (`(label1)|(label2)|…`) so each paragraph
 * gets a single linear scan instead of N scans. Skips work entirely when the
 * setting is off.
 */

import { utf8ByteLength } from "@lesefluss/rsvp-core";
import { useMemo } from "react";
import type { GlossaryEntry } from "../../services/db/schema";
import { escapeRegex } from "./glossary-utils";

export interface GlossaryRange {
	entryId: string;
	startOffset: number;
	endOffset: number;
	color: string;
	label: string;
	/** When true, the range is still tracked (so taps still open the entry) but
	 *  the inline avatar marker is suppressed in the renderer. */
	hideMarker: boolean;
}

const _encoder = new TextEncoder();

/** Convert a UTF-16 character index in `text` to its UTF-8 byte offset. */
function charIndexToByteOffset(text: string, charIdx: number): number {
	if (charIdx <= 0) return 0;
	if (charIdx >= text.length) return _encoder.encode(text).length;
	return _encoder.encode(text.slice(0, charIdx)).length;
}

interface UseGlossaryDecorationsParams {
	entries: GlossaryEntry[];
	paragraphs: string[];
	paragraphOffsets: number[];
	enabled: boolean;
}

export function useGlossaryDecorations({
	entries,
	paragraphs,
	paragraphOffsets,
	enabled,
}: UseGlossaryDecorationsParams): Map<number, GlossaryRange[]> {
	return useMemo(() => {
		const empty = new Map<number, GlossaryRange[]>();
		if (!enabled) return empty;
		if (entries.length === 0 || paragraphs.length === 0) return empty;

		// Build a single alternation regex; group N corresponds to entries[N].
		const usable = entries.filter((e) => e.label.trim().length > 0);
		if (usable.length === 0) return empty;
		const re = new RegExp(`\\b(?:${usable.map((e) => escapeRegex(e.label)).join("|")})\\b`, "gi");

		// Lookup from lower-cased label → all entries with that label.
		// Multiple entries can share a label (e.g. one global + one book-scoped); we
		// emit a range per entry so highlights and tap targets don't silently collapse.
		const byLowerLabel = new Map<string, GlossaryEntry[]>();
		for (const e of usable) {
			const key = e.label.toLowerCase();
			const arr = byLowerLabel.get(key);
			if (arr) arr.push(e);
			else byLowerLabel.set(key, [e]);
		}

		const result = new Map<number, GlossaryRange[]>();
		for (let i = 0; i < paragraphs.length; i++) {
			const para = paragraphs[i];
			const paraOffset = paragraphOffsets[i] ?? 0;
			const ranges: GlossaryRange[] = [];

			re.lastIndex = 0;
			let m: RegExpExecArray | null = re.exec(para);
			while (m !== null) {
				const matched = byLowerLabel.get(m[0].toLowerCase());
				if (matched) {
					const startByte = paraOffset + charIndexToByteOffset(para, m.index);
					const matchByteLength = utf8ByteLength(m[0]);
					for (const entry of matched) {
						ranges.push({
							entryId: entry.id,
							startOffset: startByte,
							endOffset: startByte + matchByteLength - 1,
							color: entry.color,
							label: entry.label,
							hideMarker: entry.hideMarker,
						});
					}
				}
				m = re.exec(para);
			}

			if (ranges.length > 0) result.set(i, ranges);
		}
		return result;
	}, [entries, paragraphs, paragraphOffsets, enabled]);
}

/**
 * First match of `label` in the full content (linear scan over paragraphs).
 * Returns the byte offset of the match, or null if not found. Used by the
 * "Jump to first mention" button on the entry card.
 */
export function findFirstMention(
	label: string,
	paragraphs: string[],
	paragraphOffsets: number[],
): number | null {
	if (!label.trim()) return null;
	const re = new RegExp(`\\b${escapeRegex(label)}\\b`, "i");
	for (let i = 0; i < paragraphs.length; i++) {
		const m = re.exec(paragraphs[i]);
		if (m) {
			return (paragraphOffsets[i] ?? 0) + charIndexToByteOffset(paragraphs[i], m.index);
		}
	}
	return null;
}

/**
 * First mention of `label` plus a chunk of surrounding text, snapped to word
 * boundaries. Returns null if the label isn't found in the book.
 */
export function getMentionContext(
	label: string,
	paragraphs: string[],
	contextChars = 60,
): { before: string; match: string; after: string } | null {
	if (!label.trim()) return null;
	const re = new RegExp(`\\b${escapeRegex(label)}\\b`, "i");
	for (const para of paragraphs) {
		const m = re.exec(para);
		if (!m) continue;

		// Expand context window, then snap to word boundaries so we don't cut mid-word.
		let start = Math.max(0, m.index - contextChars);
		let end = Math.min(para.length, m.index + m[0].length + contextChars);
		while (start > 0 && /\S/.test(para[start - 1])) start--;
		while (end < para.length && /\S/.test(para[end])) end++;

		const normalize = (s: string) => s.replace(/\s+/g, " ");
		return {
			before: normalize(para.slice(start, m.index)).trimStart(),
			match: m[0],
			after: normalize(para.slice(m.index + m[0].length, end)).trimEnd(),
		};
	}
	return null;
}

/**
 * First match of `label` strictly after `fromByteOffset`. Returns the byte
 * offset of the match, or null. Used by "Jump to next mention".
 */
export function findNextMention(
	label: string,
	fromByteOffset: number,
	paragraphs: string[],
	paragraphOffsets: number[],
): number | null {
	if (!label.trim()) return null;
	const re = new RegExp(`\\b${escapeRegex(label)}\\b`, "gi");
	for (let i = 0; i < paragraphs.length; i++) {
		const paraOffset = paragraphOffsets[i] ?? 0;
		re.lastIndex = 0;
		let m: RegExpExecArray | null = re.exec(paragraphs[i]);
		while (m !== null) {
			const byteOffset = paraOffset + charIndexToByteOffset(paragraphs[i], m.index);
			if (byteOffset > fromByteOffset) return byteOffset;
			m = re.exec(paragraphs[i]);
		}
	}
	return null;
}
