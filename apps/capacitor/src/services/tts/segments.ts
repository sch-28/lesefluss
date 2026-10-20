import { type WordIndex, type WordPosition, wordPos } from "@lesefluss/core";

export type SpeechSegment = {
	id: number;
	text: string;
	/** Word position of each word in `text`, parallel to `charStarts`. */
	words: WordPosition[];
	charStarts: number[];
	/** First word after this segment, where the next segment starts. */
	endWord: number;
	/** Chapter title, on the segment that opens a chapter and on a session's first segment. */
	chapter: string | null;
	/** Only real chapter openings; a session's first segment names its chapter without opening it. */
	opensChapter: boolean;
};

export type SegmentSource = {
	content: string;
	wordIndex: WordIndex;
	language: string | null;
	chapters: readonly { title: string; startWord: number }[];
};

const MAX_SEGMENT_WORDS = 60;
// Well under the engine's input limit (about 4000 chars), for run-on text without sentence ends.
const MAX_SEGMENT_CHARS = 1500;
// An overlong sentence is cut after a clause rather than mid-phrase when one ends this close to the cap.
const CLAUSE_BREAK_WINDOW = 20;
const CLAUSE_END = /[,;:]["'”’»)\]]*$/;
// Same length in, same length out, so char offsets into the content stay valid.
const HEADING_MARKER = /^([ \t]*)(#{1,6})(?=[ \t])/gm;
const LINE_BREAK = /[\r\n\t]/g;

/**
 * Splits the book's original text into sentence-sized utterances from
 * `startWord` on. The raw content is spoken rather than the word index's
 * tokens, which fold quotes and dashes for the e-reader device. Short
 * utterances let the engine report progress and resume close to the word it
 * stopped at.
 */
export function buildSegments(
	source: SegmentSource,
	startWord: number,
	firstId: number,
	maxSegments: number,
	isSessionStart: boolean,
): SpeechSegment[] {
	const { wordIndex } = source;
	const wordCount = wordIndex.wordCount;
	const sentences = sentenceSegmenter(source.language);
	const segments: SpeechSegment[] = [];
	let word = startWord;

	while (word < wordCount && segments.length < maxSegments) {
		let paragraphEnd = word + 1;
		while (paragraphEnd < wordCount && !wordIndex.wordAt(wordPos(paragraphEnd)).breakBefore) {
			paragraphEnd++;
		}
		const base = wordIndex.charOf(word);
		const text = speakable(source.content.slice(base, wordIndex.charOf(paragraphEnd)));
		const starts: number[] = [];
		for (let w = word; w < paragraphEnd; w++) starts.push(wordIndex.charOf(w) - base);

		for (const [first, end] of sentenceWordRanges(text, starts, sentences)) {
			if (segments.length >= maxSegments) return segments;
			const from = starts[first];
			const to = end < starts.length ? starts[end] : text.length;
			const words: WordPosition[] = [];
			const charStarts: number[] = [];
			for (let i = first; i < end; i++) {
				words.push(wordPos(word + i));
				charStarts.push(starts[i] - from);
			}
			const opening = chapterAt(source.chapters, word + first);
			const isFirstOfSession = isSessionStart && segments.length === 0;
			segments.push({
				id: firstId + segments.length,
				text: text.slice(from, to).trimEnd(),
				words,
				charStarts,
				endWord: word + end,
				chapter: opening.opens || isFirstOfSession ? opening.title : null,
				opensChapter: opening.opens,
			});
		}
		word = paragraphEnd;
	}
	return segments;
}

/** Word being spoken at `charStart` inside `segment`. */
export function wordAtChar(segment: SpeechSegment, charStart: number): WordPosition {
	let lo = 0;
	let hi = segment.charStarts.length - 1;
	while (lo < hi) {
		const mid = Math.ceil((lo + hi) / 2);
		if (segment.charStarts[mid] <= charStart) lo = mid;
		else hi = mid - 1;
	}
	return segment.words[lo];
}

function speakable(raw: string): string {
	return raw
		.replace(
			HEADING_MARKER,
			(_, indent: string, hashes: string) => indent + " ".repeat(hashes.length),
		)
		.replace(LINE_BREAK, " ");
}

function sentenceSegmenter(language: string | null): Intl.Segmenter | null {
	if (typeof Intl === "undefined" || !("Segmenter" in Intl)) return null;
	try {
		return new Intl.Segmenter(language ?? undefined, { granularity: "sentence" });
	} catch {
		return new Intl.Segmenter(undefined, { granularity: "sentence" });
	}
}

/** `[firstWordIndex, endWordIndex)` per utterance, indices into `starts`. */
function sentenceWordRanges(
	text: string,
	starts: readonly number[],
	sentences: Intl.Segmenter | null,
): [number, number][] {
	const boundaries: number[] = [];
	if (sentences) {
		for (const { index } of sentences.segment(text)) if (index > 0) boundaries.push(index);
	}
	const ranges: [number, number][] = [];
	let first = 0;
	let b = 0;
	for (let i = 1; i <= starts.length; i++) {
		const isLast = i === starts.length;
		let isBoundary = isLast;
		while (!isLast && b < boundaries.length && boundaries[b] <= starts[i]) {
			isBoundary = true;
			b++;
		}
		if (isBoundary) {
			for (const range of capLength(text, starts, first, i)) ranges.push(range);
			first = i;
		}
	}
	return ranges;
}

function capLength(
	text: string,
	starts: readonly number[],
	first: number,
	end: number,
): [number, number][] {
	const ranges: [number, number][] = [];
	let from = first;
	const charsUntil = (i: number) => (i < starts.length ? starts[i] : text.length) - starts[from];
	// A single word stays whole, however long.
	while (
		end - from > 1 &&
		(end - from > MAX_SEGMENT_WORDS || charsUntil(end) > MAX_SEGMENT_CHARS)
	) {
		let cut = Math.min(end - 1, from + MAX_SEGMENT_WORDS);
		while (cut > from + 1 && charsUntil(cut) > MAX_SEGMENT_CHARS) cut--;
		for (let i = cut; i > Math.max(from, cut - CLAUSE_BREAK_WINDOW); i--) {
			if (CLAUSE_END.test(text.slice(starts[i - 1], starts[i]).trimEnd())) {
				cut = i;
				break;
			}
		}
		ranges.push([from, cut]);
		from = cut;
	}
	ranges.push([from, end]);
	return ranges;
}

/** The chapter `firstWord` is in, and whether it starts exactly there. */
function chapterAt(
	chapters: SegmentSource["chapters"],
	firstWord: number,
): { title: string | null; opens: boolean } {
	let current: string | null = null;
	for (const chapter of chapters) {
		if (chapter.startWord > firstWord) break;
		if (chapter.startWord === firstWord) return { title: chapter.title, opens: true };
		current = chapter.title;
	}
	return { title: current, opens: false };
}
