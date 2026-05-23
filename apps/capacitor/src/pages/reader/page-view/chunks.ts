/**
 * Pagination chunks: size-driven slices of the book on paragraph boundaries.
 *
 * Chapters are intentionally NOT used as the chunking unit — Standard Ebooks
 * routinely puts an entire novel inside a single chapter, which would yield a
 * megachunk that takes seconds to lay out. Chunking exists purely so each
 * mount-and-layout pass stays fast; chapters remain a navigation concept (TOC
 * jumps go via word position and are routed through findChunkForWord).
 */

/** Target chunk size in words. With the sliding-window model (3 chunks
 *  mounted) the user can't perceive chunk boundaries, so smaller chunks
 *  only mean smaller per-mount work at re-anchor (the user-visible cost).
 *  ~2000 words is roughly 6 to 8 phone pages at default font. */
export const CHUNK_TARGET_WORDS = 2_000;

/** Pages a chunk's measured scrollWidth maps to. Use ceil so a partial
 *  last column still counts (Math.round would under-count pageCount, then
 *  findPageForWord clamps the target down by one page). */
export const pageCountOf = (chunkWidth: number, pageWidth: number) =>
	Math.max(1, Math.ceil(chunkWidth / pageWidth));

export interface Chunk {
	startWord: number;
	endWord: number;
	paragraphFrom: number; // index into props.paragraphs
	paragraphTo: number; // exclusive
}

export function buildChunks(
	paragraphs: string[],
	paragraphStartWords: number[],
	totalWords: number,
): Chunk[] {
	const chunks: Chunk[] = [];
	if (paragraphs.length === 0) return chunks;

	let chunkStart = paragraphStartWords[0] ?? 0;
	let chunkParaFrom = 0;
	let wordsInChunk = 0;
	for (let i = 0; i < paragraphs.length; i++) {
		const next = paragraphStartWords[i + 1] ?? totalWords;
		wordsInChunk += next - paragraphStartWords[i];
		const isLast = i === paragraphs.length - 1;
		if (wordsInChunk >= CHUNK_TARGET_WORDS || isLast) {
			// Empty-paragraph runs would produce a zero-width chunk that
			// findChunkForWord picks at the shared startWord boundary, then
			// findPageForWord finds no spans inside. Merge into the previous
			// chunk so the empty-paragraph DOM still renders.
			if (next === chunkStart && chunks.length > 0) {
				chunks[chunks.length - 1].paragraphTo = i + 1;
			} else {
				chunks.push({
					startWord: chunkStart,
					endWord: next,
					paragraphFrom: chunkParaFrom,
					paragraphTo: i + 1,
				});
			}
			chunkStart = next;
			chunkParaFrom = i + 1;
			wordsInChunk = 0;
		}
	}
	return chunks;
}

/** Binary search for the chunk containing the given word index. */
export function findChunkForWord(chunks: Chunk[], word: number): number {
	let lo = 0;
	let hi = chunks.length - 1;
	while (lo < hi) {
		const mid = Math.ceil((lo + hi) / 2);
		if (chunks[mid].startWord <= word) lo = mid;
		else hi = mid - 1;
	}
	return lo;
}

/** Returns up to 3 chunk indices: [prev, current, next], with prev/next omitted
 *  at the book's edges. The visible window is rendered as siblings inside the
 *  transform wrapper, so navigation between adjacent chunks is one continuous
 *  translateX rather than a content swap. */
export function visibleWindow(currentIdx: number, totalChunks: number): number[] {
	if (totalChunks === 0) return [];
	const out: number[] = [];
	if (currentIdx > 0) out.push(currentIdx - 1);
	out.push(currentIdx);
	if (currentIdx < totalChunks - 1) out.push(currentIdx + 1);
	return out;
}

/** Returns each visible chunk's left offset relative to the CURRENT chunk
 *  (current sits at 0; prev is negative; next is positive). Used as the inline
 *  `left` style on each chunk container so they line up side-by-side regardless
 *  of which one is current. Falls back to `pageWidth` for chunks whose layout
 *  hasn't measured yet — those chunks are off-screen during normal viewing, so
 *  the placeholder only matters for cross-chunk gestures. */
export function relativeOffsets(
	visibleIndices: number[],
	currentIdx: number,
	widths: ReadonlyMap<number, number>,
	fallbackWidth: number,
): Map<number, number> {
	const result = new Map<number, number>();
	const widthOf = (idx: number) => widths.get(idx) ?? fallbackWidth;
	let acc = 0;
	for (const idx of visibleIndices) {
		if (idx === currentIdx) {
			result.set(idx, 0);
			acc = widthOf(idx);
		} else if (idx > currentIdx) {
			result.set(idx, acc);
			acc += widthOf(idx);
		}
	}
	let backAcc = 0;
	for (let i = visibleIndices.length - 1; i >= 0; i--) {
		const idx = visibleIndices[i];
		if (idx >= currentIdx) continue;
		backAcc += widthOf(idx);
		result.set(idx, -backAcc);
	}
	return result;
}
