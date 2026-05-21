import { buildWordIndex, type WordEntry } from "./engine";
import { utf8ByteLength } from "./utf8";

declare const wordPositionBrand: unique symbol;

export type WordPosition = number & { readonly [wordPositionBrand]: true };

export const wordPos = (n: number): WordPosition => n as WordPosition;

/**
 * On-disk shape. Content is sourced separately from `book_content.content`
 * and passed to `deserialize`, so the blob holds only the offset arrays.
 *
 * v1 blobs are rejected by `deserialize`; callers fall back to
 * `WordIndex.build` on the row's content.
 */
export interface SerializedWordIndex {
	v: 2;
	byteOffsets: number[];
	breakBeforeMask: number[];
}

export class WordIndex {
	private readonly content: string;
	private readonly byteOffsets: readonly number[];
	private readonly breakBeforeMask: readonly number[];
	private charOffsetsCache: readonly number[] | null = null;
	private entriesCache: readonly WordEntry[] | null = null;

	private constructor(
		content: string,
		byteOffsets: readonly number[],
		breakBeforeMask: readonly number[],
		entries: readonly WordEntry[] | null,
	) {
		this.content = content;
		this.byteOffsets = byteOffsets;
		this.breakBeforeMask = breakBeforeMask;
		this.entriesCache = entries;
	}

	static build(content: string): WordIndex {
		const entries = buildWordIndex(content);
		const byteOffsets = entries.map((e) => e.byteOffset);
		const mask = bitsToMask(entries.map((e) => Boolean(e.breakBefore)));
		return new WordIndex(content, byteOffsets, mask, entries);
	}

	static deserialize(blob: SerializedWordIndex, content: string): WordIndex {
		if (blob.v !== 2) {
			throw new Error(`Unsupported WordIndex blob version: ${blob.v}`);
		}
		return new WordIndex(content, blob.byteOffsets, blob.breakBeforeMask, null);
	}

	serialize(): SerializedWordIndex {
		return {
			v: 2,
			byteOffsets: [...this.byteOffsets],
			breakBeforeMask: [...this.breakBeforeMask],
		};
	}

	get wordCount(): number {
		return this.byteOffsets.length;
	}

	wordAt(pos: WordPosition): WordEntry {
		if (pos < 0 || pos >= this.byteOffsets.length) {
			throw new RangeError(`WordPosition out of range: ${pos}`);
		}
		if (this.entriesCache) return this.entriesCache[pos];
		return this.materializeEntry(pos);
	}

	listEntries(): readonly WordEntry[] {
		if (this.entriesCache) return this.entriesCache;
		const n = this.byteOffsets.length;
		const arr = new Array<WordEntry>(n);
		for (let i = 0; i < n; i++) arr[i] = this.materializeEntry(i);
		this.entriesCache = arr;
		return arr;
	}

	byteOf(pos: WordPosition): number {
		const off = this.byteOffsets[pos];
		if (off === undefined) {
			throw new RangeError(`WordPosition out of range: ${pos}`);
		}
		return off;
	}

	wordOf(byteOffset: number): WordPosition {
		const offsets = this.byteOffsets;
		if (offsets.length === 0) return wordPos(0);
		if (byteOffset <= offsets[0]) return wordPos(0);
		if (byteOffset >= offsets[offsets.length - 1]) {
			return wordPos(offsets.length - 1);
		}
		let lo = 0;
		let hi = offsets.length - 1;
		while (lo < hi) {
			const mid = Math.ceil((lo + hi) / 2);
			if (offsets[mid] <= byteOffset) {
				lo = mid;
			} else {
				hi = mid - 1;
			}
		}
		return wordPos(lo);
	}

	wordsBetween(a: WordPosition, b: WordPosition): number {
		return Math.abs(a - b);
	}

	wordAndCharOf(byteOffset: number): { word: WordPosition; charInWord: number } {
		if (this.byteOffsets.length === 0) return { word: wordPos(0), charInWord: 0 };
		const w = this.wordOf(byteOffset);
		const entry = this.wordAt(w);
		const wordByteLen = utf8ByteLength(entry.word);
		const bytesIntoWord = byteOffset - entry.byteOffset;

		if (bytesIntoWord >= wordByteLen) {
			const next = w + 1;
			if (next < this.byteOffsets.length) {
				return { word: wordPos(next), charInWord: 0 };
			}
			return { word: w, charInWord: codePointCount(entry.word) };
		}

		if (bytesIntoWord <= 0) {
			return { word: w, charInWord: 0 };
		}

		let bytes = 0;
		let charIdx = 0;
		for (const c of entry.word) {
			const clen = utf8ByteLength(c);
			if (bytes + clen > bytesIntoWord) break;
			bytes += clen;
			charIdx++;
		}
		return { word: w, charInWord: charIdx };
	}

	private materializeEntry(pos: number): WordEntry {
		const charOffsets = this.ensureCharOffsets();
		const start = charOffsets[pos];
		const end = pos + 1 < charOffsets.length ? charOffsets[pos + 1] : this.content.length;
		const word = this.content.slice(start, end).replace(/\s+$/, "");
		const entry: WordEntry = { word, byteOffset: this.byteOffsets[pos] };
		if (maskBit(this.breakBeforeMask, pos)) entry.breakBefore = true;
		return entry;
	}

	private ensureCharOffsets(): readonly number[] {
		if (this.charOffsetsCache) return this.charOffsetsCache;
		const byteOffsets = this.byteOffsets;
		const n = byteOffsets.length;
		const arr = new Array<number>(n);
		const content = this.content;
		let oi = 0;
		let bytePos = 0;
		while (oi < n && byteOffsets[oi] <= bytePos) {
			arr[oi++] = 0;
		}
		for (let i = 0; i < content.length; ) {
			const code = content.charCodeAt(i);
			let bytes: number;
			let step: number;
			if (code < 0x80) {
				bytes = 1;
				step = 1;
			} else if (code < 0x800) {
				bytes = 2;
				step = 1;
			} else if (code >= 0xd800 && code <= 0xdbff) {
				// High surrogate → 4-byte UTF-8 codepoint, 2 UTF-16 code units.
				bytes = 4;
				step = 2;
			} else {
				bytes = 3;
				step = 1;
			}
			bytePos += bytes;
			i += step;
			while (oi < n && byteOffsets[oi] <= bytePos) {
				arr[oi++] = i;
			}
		}
		while (oi < n) arr[oi++] = content.length;
		this.charOffsetsCache = arr;
		return arr;
	}
}

function codePointCount(s: string): number {
	let n = 0;
	for (const _ of s) n++;
	return n;
}

function bitsToMask(bits: boolean[]): number[] {
	const mask: number[] = [];
	for (let i = 0; i < bits.length; i += 32) {
		let word = 0;
		for (let b = 0; b < 32 && i + b < bits.length; b++) {
			if (bits[i + b]) word |= 1 << b;
		}
		mask.push(word);
	}
	return mask;
}

function maskBit(mask: readonly number[], i: number): boolean {
	const word = mask[Math.floor(i / 32)] ?? 0;
	return (word & (1 << (i % 32))) !== 0;
}
