/**
 * Compute glossary inline-underline decorations per paragraph.
 *
 * Mirrors the shape of `highlightsByParagraph` in use-highlight-selection.ts:
 * a Map<paragraphIndex, GlossaryRange[]> consumed by Paragraph.tsx. Ranges
 * are word-index based (ADR-0002); regex matches happen against the
 * paragraph string and the resulting byte offset is converted through the
 * book's WordIndex.
 *
 * Builds one combined alternation regex (`(label1)|(label2)|…`) so each paragraph
 * gets a single linear scan instead of N scans. Skips work entirely when the
 * setting is off or the WordIndex hasn't loaded.
 */

import {
	charIndexToByteOffset,
	utf8ByteLength,
	type WordIndex,
	type WordPosition,
} from "@lesefluss/core";
import { useMemo } from "react";
import type { GlossaryEntry } from "../../services/db/schema";
import { escapeRegex } from "./glossary-utils";

export interface GlossaryRange {
	entryId: string;
	startWord: WordPosition;
	endWord: WordPosition;
	color: string;
	label: string;
	/** When true, the range is still tracked (so taps still open the entry) but
	 *  the inline avatar marker is suppressed in the renderer. */
	hideMarker: boolean;
}

const WORD_CHAR = "[\\p{L}\\p{N}_]";

function buildLabelRegex(escapedAlternation: string, flags: string): RegExp {
	return new RegExp(`(?<!${WORD_CHAR})(?:${escapedAlternation})(?!${WORD_CHAR})`, `${flags}u`);
}

interface UseGlossaryDecorationsParams {
	entries: GlossaryEntry[];
	paragraphs: string[];
	paragraphOffsets: number[];
	enabled: boolean;
	wordIndex: WordIndex | null;
}

export function useGlossaryDecorations({
	entries,
	paragraphs,
	paragraphOffsets,
	enabled,
	wordIndex,
}: UseGlossaryDecorationsParams): Map<number, GlossaryRange[]> {
	return useMemo(() => {
		const empty = new Map<number, GlossaryRange[]>();
		if (!enabled || !wordIndex) return empty;
		if (entries.length === 0 || paragraphs.length === 0) return empty;

		const usable = entries
			.map((e) => ({ entry: e, label: e.label.trim() }))
			.filter((x) => x.label.length > 0);
		if (usable.length === 0) return empty;
		const re = buildLabelRegex(usable.map((x) => escapeRegex(x.label)).join("|"), "gi");

		const byLowerLabel = new Map<string, GlossaryEntry[]>();
		for (const { entry: e, label } of usable) {
			const key = label.toLowerCase();
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
					const startWord = wordIndex.wordOf(startByte);
					const endWord = wordIndex.wordOf(startByte + matchByteLength - 1);
					for (const entry of matched) {
						ranges.push({
							entryId: entry.id,
							startWord,
							endWord,
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
	}, [entries, paragraphs, paragraphOffsets, enabled, wordIndex]);
}

/**
 * First match of `label` in the full content (linear scan over paragraphs).
 * Returns the WORD INDEX of the match, or null if not found. Used by the
 * "Jump to first mention" button on the entry card.
 */
export function findFirstMention(
	label: string,
	paragraphs: string[],
	paragraphOffsets: number[],
	wordIndex: WordIndex | null,
): number | null {
	if (!label.trim() || !wordIndex) return null;
	const re = buildLabelRegex(escapeRegex(label), "i");
	for (let i = 0; i < paragraphs.length; i++) {
		const m = re.exec(paragraphs[i]);
		if (m) {
			const byteOffset = (paragraphOffsets[i] ?? 0) + charIndexToByteOffset(paragraphs[i], m.index);
			return wordIndex.wordOf(byteOffset);
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
	const re = buildLabelRegex(escapeRegex(label), "i");
	for (const para of paragraphs) {
		const m = re.exec(para);
		if (!m) continue;

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
 * First match of `label` strictly after `fromWord`. Returns the WORD INDEX
 * of the match, or null. Used by "Jump to next mention".
 */
export function findNextMention(
	label: string,
	fromWord: number,
	paragraphs: string[],
	paragraphOffsets: number[],
	wordIndex: WordIndex | null,
): number | null {
	if (!label.trim() || !wordIndex) return null;
	const re = buildLabelRegex(escapeRegex(label), "gi");
	for (let i = 0; i < paragraphs.length; i++) {
		const paraOffset = paragraphOffsets[i] ?? 0;
		re.lastIndex = 0;
		let m: RegExpExecArray | null = re.exec(paragraphs[i]);
		while (m !== null) {
			const byteOffset = paraOffset + charIndexToByteOffset(paragraphs[i], m.index);
			const wordIdx = wordIndex.wordOf(byteOffset);
			if (wordIdx > fromWord) return wordIdx;
			m = re.exec(paragraphs[i]);
		}
	}
	return null;
}
