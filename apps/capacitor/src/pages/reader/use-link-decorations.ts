/**
 * Compute external-hyperlink decorations per paragraph.
 *
 * Mirrors useGlossaryDecorations: returns Map<paragraphIndex, LinkDecoration[]>
 * consumed by Paragraph.tsx, with ranges in word-index units (ADR-0002). Two
 * sources feed it:
 *   - stored links captured at import (DB word ranges), bucketed by paragraph;
 *   - bare `http(s)://` URLs sitting in the text, detected at render so even
 *     books imported before link capture get clickable URLs.
 * A bare URL overlapping a stored link is dropped so a word is never decorated
 * twice.
 */

import {
	byteRangeToWordRange,
	charIndexToByteOffset,
	paragraphIndexForWord,
	utf8ByteLength,
	type WordIndex,
} from "@lesefluss/core";
import { useMemo } from "react";
import type { LinkRange } from "../../services/db/schema";

export type LinkDecoration = { startWord: number; endWord: number; href: string };

// Bare URL run, bounded by whitespace. Trailing punctuation is trimmed below so
// "(see https://x.example/y)." doesn't capture the closing paren / period.
const BARE_URL_RE = /(?<!\S)https?:\/\/\S+/gi;
const TRAILING_PUNCT_RE = /[.,;:!?)\]}>'"]+$/;

function push(map: Map<number, LinkDecoration[]>, paragraph: number, deco: LinkDecoration): void {
	const arr = map.get(paragraph);
	if (arr) arr.push(deco);
	else map.set(paragraph, [deco]);
}

interface UseLinkDecorationsParams {
	storedLinks: LinkRange[];
	paragraphs: string[];
	paragraphOffsets: number[];
	paragraphStartWords: number[];
	wordIndex: WordIndex | null;
}

export function useLinkDecorations({
	storedLinks,
	paragraphs,
	paragraphOffsets,
	paragraphStartWords,
	wordIndex,
}: UseLinkDecorationsParams): Map<number, LinkDecoration[]> {
	return useMemo(() => {
		const result = new Map<number, LinkDecoration[]>();
		if (!wordIndex || paragraphs.length === 0) return result;

		for (const link of storedLinks) {
			const pi = paragraphIndexForWord(paragraphStartWords, link.startWord);
			push(result, pi, { startWord: link.startWord, endWord: link.endWord, href: link.href });
		}

		for (let i = 0; i < paragraphs.length; i++) {
			const para = paragraphs[i];
			if (!para.includes("http")) continue;
			const paraOffset = paragraphOffsets[i] ?? 0;
			BARE_URL_RE.lastIndex = 0;
			let m: RegExpExecArray | null = BARE_URL_RE.exec(para);
			while (m !== null) {
				const url = m[0].replace(TRAILING_PUNCT_RE, "");
				if (url.length > "https://".length) {
					const startByte = paraOffset + charIndexToByteOffset(para, m.index);
					const { startWord, endWord } = byteRangeToWordRange(
						wordIndex,
						startByte,
						startByte + utf8ByteLength(url),
					);
					const existing = result.get(i);
					const hasOverlap = existing?.some(
						(r) => !(endWord < r.startWord || startWord > r.endWord),
					);
					if (!hasOverlap) push(result, i, { startWord, endWord, href: url });
				}
				m = BARE_URL_RE.exec(para);
			}
		}

		return result;
	}, [storedLinks, paragraphs, paragraphOffsets, paragraphStartWords, wordIndex]);
}
