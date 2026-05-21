/**
 * Build a `.rsvp` document for the rsvpnano firmware.
 *
 * Two format versions are supported:
 *
 * v1 (legacy, kept for sideload compatibility with upstream rsvpnano):
 *   The body text is shipped raw with `@chapter` directives interleaved. The
 *   device tokenizes on first open. App ↔ device word streams may drift
 *   because both tokenizers run independently.
 *
 *     @rsvp 1
 *     @title <title>
 *     @author <author>
 *     @source <source>
 *
 *     @chapter <chapter title>
 *     <body lines, leading `@` escaped to `@@`>
 *
 * v2 (lesefluss canonical):
 *   The app ships the canonical word list directly, computed via the
 *   `@lesefluss/core` WordIndex. The device skips its own tokenizer and
 *   populates `WordRecord[]` straight from the list, guaranteeing matching
 *   word indices on both sides. Body bytes are not shipped because the
 *   device's reader is word-only at runtime.
 *
 *     @rsvp 2
 *     @title <title>
 *     @author <author>
 *     @source <source>
 *
 *     @words <N>
 *     <word>           (N lines, raw. Parser is count-bounded so leading `@`
 *                       in word text is safe)
 *
 *     @paragraphs <M>
 *     <wordIndex>      (M lines)
 *
 *     @chapters <K>
 *     <wordIndex>\t<title>  (K lines)
 */

import type { WordIndex } from "@lesefluss/core";
import { utf8ByteLength } from "@lesefluss/core";

export type RsvpChapter = {
	title: string;
	startByte: number;
};

export type BuildRsvpDocumentInput = {
	title: string;
	author?: string | null;
	source?: string | null;
	body: string;
	/** Sorted ascending by startByte. Empty / undefined → single synthetic chapter (v1) or no chapter markers (v2). */
	chapters?: RsvpChapter[];
	/** Required for v2; ignored for v1. */
	wordIndex?: WordIndex;
	/** Defaults to 2 when wordIndex is supplied, else 1. */
	version?: 1 | 2;
};

const TEXT_ENCODER = new TextEncoder();
const LF = "\n";
const TAB = "\t";

function directiveText(value: string): string {
	return value.replace(/[\r\n\t]+/g, " ").trim();
}

function escapeBody(text: string): string {
	return text.replace(/(^|\n)@/g, (_match, prefix) => `${prefix}@@`);
}

function sliceBody(body: string, start: number, end: number): string {
	return body.slice(start, end).replace(/^\s+|\s+$/g, "");
}

function buildV1(input: BuildRsvpDocumentInput): Uint8Array {
	const lines: string[] = [];
	lines.push(`@rsvp 1`);
	const title = directiveText(input.title || "Untitled");
	lines.push(`@title ${title}`);
	const author = input.author ? directiveText(input.author) : "";
	if (author) lines.push(`@author ${author}`);
	const source = input.source ? directiveText(input.source) : "";
	if (source) lines.push(`@source ${source}`);
	lines.push("");

	const sorted = (input.chapters ?? [])
		.filter((c) => Number.isFinite(c.startByte) && c.startByte >= 0)
		.slice()
		.sort((a, b) => a.startByte - b.startByte);

	if (sorted.length === 0) {
		lines.push(`@chapter ${title}`);
		const escaped = escapeBody(input.body.replace(/^\s+|\s+$/g, ""));
		if (escaped) lines.push(escaped);
	} else {
		for (let i = 0; i < sorted.length; i++) {
			const chapter = sorted[i];
			const sliceStart = i === 0 ? 0 : chapter.startByte;
			const sliceEnd = i + 1 < sorted.length ? sorted[i + 1].startByte : input.body.length;
			const chapterTitle = directiveText(chapter.title || `Chapter ${i + 1}`);
			lines.push(`@chapter ${chapterTitle}`);
			const slice = sliceBody(input.body, sliceStart, sliceEnd);
			if (slice) lines.push(escapeBody(slice));
			lines.push("");
		}
		if (lines[lines.length - 1] === "") lines.pop();
	}

	return TEXT_ENCODER.encode(`${lines.join(LF)}${LF}`);
}

function buildV2(input: BuildRsvpDocumentInput & { wordIndex: WordIndex }): Uint8Array {
	const idx = input.wordIndex;
	const entries = idx.listEntries();

	// Paragraph word indices. Mirror the reader's paragraph split (`\n\n`) so
	// the device's chapter/paragraph navigation aligns with the app's.
	const paragraphs = input.body.split("\n\n");
	const paragraphWordIndices: number[] = [];
	let byte = 0;
	for (let i = 0; i < paragraphs.length; i++) {
		paragraphWordIndices.push(idx.wordOf(byte) as number);
		byte += utf8ByteLength(paragraphs[i]) + 2; // +2 = "\n\n" separator (always 2 bytes)
	}

	const sortedChapters = (input.chapters ?? [])
		.filter((c) => Number.isFinite(c.startByte) && c.startByte >= 0)
		.slice()
		.sort((a, b) => a.startByte - b.startByte);
	const chapterEntries = sortedChapters.map((c) => ({
		wordIndex: idx.wordOf(c.startByte) as number,
		title: directiveText(c.title || ""),
	}));

	const lines: string[] = [];
	lines.push(`@rsvp 2`);
	lines.push(`@title ${directiveText(input.title || "Untitled")}`);
	if (input.author) lines.push(`@author ${directiveText(input.author)}`);
	if (input.source) lines.push(`@source ${directiveText(input.source)}`);
	lines.push("");

	const wordsHeader = lines.length;
	lines.push(`@words ${entries.length}`);
	let nlInWords = 0;
	for (const e of entries) {
		// Guard: e.word must not contain newlines. If it does, the firmware's
		// line-by-line parser will see more lines than `entries.length` and the
		// count-bounded v2 block accounting falls apart. Tokenizer should never
		// emit \n inside a word; assert + strip as a safety net.
		if (e.word.indexOf("\n") >= 0) {
			nlInWords++;
			lines.push(e.word.replace(/\n/g, ""));
		} else {
			lines.push(e.word);
		}
	}
	const parasHeader = lines.length;
	lines.push(`@paragraphs ${paragraphWordIndices.length}`);
	for (const w of paragraphWordIndices) lines.push(String(w));

	const chaptersHeader = lines.length;
	lines.push(`@chapters ${chapterEntries.length}`);
	for (const c of chapterEntries) lines.push(`${c.wordIndex}${TAB}${c.title}`);

	// Diagnostics: surface alignment between declared counts and pushed lines.
	// nlInWords > 0 indicates a tokenizer bug (we sanitized but want to know).
	if (typeof console !== "undefined") {
		console.log(
			`[rsvp-v2] pushed words=${parasHeader - wordsHeader - 1} declared=${entries.length} ` +
				`paragraphs=${chaptersHeader - parasHeader - 1}/${paragraphWordIndices.length} ` +
				`chapters=${lines.length - chaptersHeader - 1}/${chapterEntries.length} ` +
				`nlInWords=${nlInWords}`,
		);
	}

	return TEXT_ENCODER.encode(lines.join(LF) + LF);
}

export function buildRsvpDocument(input: BuildRsvpDocumentInput): Uint8Array {
	const version = input.version ?? (input.wordIndex ? 2 : 1);
	if (version === 2) {
		if (!input.wordIndex) {
			throw new Error("buildRsvpDocument: v2 requires a wordIndex");
		}
		return buildV2(input as BuildRsvpDocumentInput & { wordIndex: WordIndex });
	}
	return buildV1(input);
}
