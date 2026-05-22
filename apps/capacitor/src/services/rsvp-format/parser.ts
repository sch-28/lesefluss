/**
 * TS reference parser for the .rsvp v2 format. Mirrors the firmware state
 * machine in `apps/rsvpnano/src/storage/StorageManager.cpp::processIndexedRsvpV2Line`
 * exactly so that builder.ts ↔ firmware integration can be tested without
 * flashing hardware.
 *
 * Authoritative spec: docs/rsvp-protocol.md.
 *
 * Used by tests only. Not shipped to the device runtime.
 */

export type ParsedRsvpV2Chapter = {
	wordIndex: number;
	title: string;
};

export type ParsedRsvpV2 = {
	version: 2;
	title: string;
	author: string;
	source: string;
	words: string[];
	paragraphStarts: number[];
	chapters: ParsedRsvpV2Chapter[];
	stats: {
		totalBytes: number;
		totalLines: number;
		strayLines: number;
		v2Remaining: number;
		finalState: V2State;
		keepReading: boolean;
		failed: boolean;
		failure: string;
	};
};

export type ParseRsvpError = {
	kind: "wrong-version";
	declaredVersion: number;
};

type V2State = "HEADER" | "WORDS" | "PARAGRAPHS" | "CHAPTERS" | "DONE";

const DECODER = new TextDecoder("utf-8");

/**
 * Parse .rsvp v2 bytes into the canonical word stream + metadata. Throws if
 * the first directive is not `@rsvp 2`. v1 files are out of scope for this
 * parser; the firmware has a separate path for them.
 */
export function parseRsvpV2(bytes: Uint8Array): ParsedRsvpV2 {
	const text = DECODER.decode(bytes);
	// Firmware strips \r and splits on \n.
	const lines = text.replace(/\r/g, "").split("\n");

	const result: ParsedRsvpV2 = {
		version: 2,
		title: "",
		author: "",
		source: "",
		words: [],
		paragraphStarts: [],
		chapters: [],
		stats: {
			totalBytes: bytes.length,
			totalLines: lines.length,
			strayLines: 0,
			v2Remaining: 0,
			finalState: "HEADER",
			keepReading: true,
			failed: false,
			failure: "",
		},
	};

	let state: V2State = "HEADER";
	let v2Remaining = 0;
	let v2Mode = false;

	for (let i = 0; i < lines.length && result.stats.keepReading; i++) {
		const raw = lines[i];

		// Pre-v2 dispatcher: detect `@rsvp 2`, otherwise drop into v2 parser.
		if (!v2Mode) {
			const trimmed = stripBom(raw);
			if (trimmed === "") continue;
			const lowered = trimmed.toLowerCase();
			if (prefixHasBoundary(lowered, "@rsvp")) {
				const declared = parseDirectiveInt(trimmed, "@rsvp");
				if (declared >= 2) {
					v2Mode = true;
					state = "HEADER";
				} else {
					const err: ParseRsvpError = { kind: "wrong-version", declaredVersion: declared };
					throw Object.assign(new Error("not a v2 rsvp file"), err);
				}
				continue;
			}
			// Anything else before `@rsvp 2` is ignored; firmware would treat as v1 body.
			continue;
		}

		const trimmed = stripBom(raw);

		switch (state) {
			case "HEADER": {
				if (trimmed === "") break;
				const lowered = trimmed.toLowerCase();
				if (prefixHasBoundary(lowered, "@title")) {
					result.title = directiveValue(trimmed, "@title");
				} else if (prefixHasBoundary(lowered, "@author")) {
					result.author = directiveValue(trimmed, "@author");
				} else if (prefixHasBoundary(lowered, "@source")) {
					result.source = directiveValue(trimmed, "@source");
				} else if (prefixHasBoundary(lowered, "@words")) {
					const n = parseDirectiveInt(trimmed, "@words");
					if (n <= 0) {
						state = "PARAGRAPHS";
					} else {
						v2Remaining = n;
						state = "WORDS";
					}
				}
				// Any other directive or stray line is silently skipped in HEADER.
				break;
			}
			case "WORDS": {
				if (v2Remaining === 0) {
					state = "PARAGRAPHS";
					i--; // Re-dispatch this line in the new state.
					continue;
				}
				// INV-P4: every line is a word, regardless of leading `@`.
				result.words.push(raw);
				v2Remaining--;
				if (v2Remaining === 0) state = "PARAGRAPHS";
				break;
			}
			case "PARAGRAPHS": {
				if (trimmed === "") break;
				if (v2Remaining === 0) {
					if (trimmed.startsWith("@")) {
						const lowered = trimmed.toLowerCase();
						if (prefixHasBoundary(lowered, "@paragraphs")) {
							v2Remaining = parseDirectiveInt(trimmed, "@paragraphs");
							if (v2Remaining === 0) state = "CHAPTERS";
							break;
						}
					}
					result.stats.strayLines++;
					break;
				}
				const wordIndex = Number.parseInt(trimmed, 10);
				if (Number.isFinite(wordIndex)) {
					// Dedupe consecutive equal entries (matches firmware behavior).
					const last = result.paragraphStarts[result.paragraphStarts.length - 1];
					if (last !== wordIndex) result.paragraphStarts.push(wordIndex);
				}
				v2Remaining--;
				if (v2Remaining === 0) state = "CHAPTERS";
				break;
			}
			case "CHAPTERS": {
				if (trimmed === "") break;
				if (v2Remaining === 0) {
					if (trimmed.startsWith("@")) {
						const lowered = trimmed.toLowerCase();
						if (prefixHasBoundary(lowered, "@chapters")) {
							v2Remaining = parseDirectiveInt(trimmed, "@chapters");
							if (v2Remaining === 0) state = "DONE";
							break;
						}
					}
					result.stats.strayLines++;
					break;
				}
				const tab = trimmed.indexOf("\t");
				const wordIndex =
					tab > 0 ? Number.parseInt(trimmed.slice(0, tab), 10) : Number.parseInt(trimmed, 10);
				const title = tab > 0 ? trimmed.slice(tab + 1).trim() : "";
				if (Number.isFinite(wordIndex) && title.length > 0) {
					const last = result.chapters[result.chapters.length - 1];
					if (!last || last.wordIndex !== wordIndex) {
						result.chapters.push({ wordIndex, title });
					} else {
						result.chapters[result.chapters.length - 1] = { wordIndex, title };
					}
				}
				v2Remaining--;
				if (v2Remaining === 0) state = "DONE";
				break;
			}
			case "DONE":
				// Anything after DONE is ignored, mirroring firmware behavior.
				break;
		}
	}

	result.stats.finalState = state;
	result.stats.v2Remaining = v2Remaining;
	return result;
}

// ── Helpers (mirrors firmware utility functions) ─────────────────────────────

function stripBom(s: string): string {
	let i = 0;
	while (i < s.length && (s.charCodeAt(i) === 0xfeff || isAsciiTrimChar(s.charCodeAt(i)))) i++;
	let j = s.length;
	while (j > i && isAsciiTrimChar(s.charCodeAt(j - 1))) j--;
	return s.slice(i, j);
}

function isAsciiTrimChar(c: number): boolean {
	return c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d || c === 0x0b || c === 0x0c;
}

function prefixHasBoundary(loweredLine: string, directive: string): boolean {
	if (!loweredLine.startsWith(directive)) return false;
	if (loweredLine.length === directive.length) return true;
	const next = loweredLine.charCodeAt(directive.length);
	// Firmware uses boundary chars: whitespace, ':', '.', '-'.
	if (next <= 0x20) return true;
	if (next === 0x3a || next === 0x2e || next === 0x2d) return true;
	return false;
}

function directiveValue(line: string, directive: string): string {
	let value = line.slice(directive.length);
	value = value.replace(/^[\s\t]+|[\s\t]+$/g, "");
	if (value.length > 0 && (value[0] === ":" || value[0] === "." || value[0] === "-")) {
		value = value.slice(1).replace(/^[\s\t]+|[\s\t]+$/g, "");
	}
	return value;
}

function parseDirectiveInt(line: string, directive: string): number {
	const n = Number.parseInt(directiveValue(line, directive), 10);
	return Number.isFinite(n) ? n : 0;
}
