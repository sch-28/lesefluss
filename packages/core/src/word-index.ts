import { buildWordIndex, type WordEntry } from "./engine";
import { utf8ByteLength } from "./utf8";

declare const wordPositionBrand: unique symbol;

export type WordPosition = number & { readonly [wordPositionBrand]: true };

export const wordPos = (n: number): WordPosition => n as WordPosition;

export interface SerializedWordIndex {
	v: 1;
	content: string;
	byteOffsets: number[];
	breakBeforeMask: number[];
}

export class WordIndex {
	private readonly content: string;
	private readonly entries: readonly WordEntry[];

	private constructor(content: string, entries: readonly WordEntry[]) {
		this.content = content;
		this.entries = entries;
	}

	static build(content: string): WordIndex {
		return new WordIndex(content, buildWordIndex(content));
	}

	static deserialize(blob: SerializedWordIndex): WordIndex {
		if (blob.v !== 1) {
			throw new Error(`Unsupported WordIndex blob version: ${blob.v}`);
		}
		const entries = rebuildEntries(blob.content, blob.byteOffsets, blob.breakBeforeMask);
		return new WordIndex(blob.content, entries);
	}

	serialize(): SerializedWordIndex {
		const byteOffsets = this.entries.map((e) => e.byteOffset);
		const breakBeforeMask = bitsToMask(this.entries.map((e) => Boolean(e.breakBefore)));
		return { v: 1, content: this.content, byteOffsets, breakBeforeMask };
	}

	get wordCount(): number {
		return this.entries.length;
	}

	wordAt(pos: WordPosition): WordEntry {
		const entry = this.entries[pos];
		if (!entry) throw new RangeError(`WordPosition out of range: ${pos}`);
		return entry;
	}

	listEntries(): readonly WordEntry[] {
		return this.entries;
	}

	byteOf(pos: WordPosition): number {
		return this.wordAt(pos).byteOffset;
	}

	wordOf(byteOffset: number): WordPosition {
		if (this.entries.length === 0) return wordPos(0);
		if (byteOffset <= this.entries[0].byteOffset) return wordPos(0);
		if (byteOffset >= this.entries[this.entries.length - 1].byteOffset) {
			return wordPos(this.entries.length - 1);
		}
		let lo = 0;
		let hi = this.entries.length - 1;
		while (lo < hi) {
			const mid = Math.ceil((lo + hi) / 2);
			if (this.entries[mid].byteOffset <= byteOffset) {
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
		if (this.entries.length === 0) return { word: wordPos(0), charInWord: 0 };
		const w = this.wordOf(byteOffset);
		const entry = this.entries[w];
		const wordByteLen = utf8ByteLength(entry.word);
		const bytesIntoWord = byteOffset - entry.byteOffset;

		if (bytesIntoWord >= wordByteLen) {
			const next = w + 1;
			if (next < this.entries.length) {
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

function maskBit(mask: number[], i: number): boolean {
	const word = mask[Math.floor(i / 32)] ?? 0;
	return (word & (1 << i % 32)) !== 0;
}

function rebuildEntries(
	content: string,
	byteOffsets: number[],
	breakBeforeMask: number[],
): WordEntry[] {
	const encoder = new TextEncoder();
	const decoder = new TextDecoder("utf-8");
	const contentBytes = encoder.encode(content);

	const entries: WordEntry[] = [];
	for (let i = 0; i < byteOffsets.length; i++) {
		const start = byteOffsets[i];
		const end = i + 1 < byteOffsets.length ? byteOffsets[i + 1] : contentBytes.length;
		const slice = contentBytes.subarray(start, end);
		const word = decoder.decode(slice).replace(/\s+$/, "");
		const entry: WordEntry = { word, byteOffset: start };
		if (maskBit(breakBeforeMask, i)) entry.breakBefore = true;
		entries.push(entry);
	}
	return entries;
}
