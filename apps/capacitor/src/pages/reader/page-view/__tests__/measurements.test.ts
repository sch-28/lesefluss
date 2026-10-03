import { afterEach, describe, expect, it } from "vitest";
import { findPageForWord, readFirstVisibleWord } from "../measurements";

const PAGE_WIDTH = 300;
const WORD_WIDTH = 40;
const LINE_HEIGHT = 24;
const WORDS_PER_LINE = 6;
const LINES_PER_PAGE = 10;
const PER_PAGE = WORDS_PER_LINE * LINES_PER_PAGE;

type Box = { page: number; line: number; slot: number };
type Word = { word: number; boxes: Box[] };

const rectOf = ({ page, line, slot }: Box) =>
	new DOMRect(page * PAGE_WIDTH + slot * WORD_WIDTH, line * LINE_HEIGHT, WORD_WIDTH - 4, 20);

/** Word spans in DOM order, each with the line boxes it occupies in the columns. */
function layOut(words: Word[]) {
	const columns = document.createElement("div");
	columns.getBoundingClientRect = () => new DOMRect(0, 0, PAGE_WIDTH * 100, 800);
	let reads = 0;
	for (const { word, boxes } of words) {
		const span = document.createElement("span");
		span.dataset.word = String(word);
		span.getClientRects = () => {
			reads++;
			return boxes.map(rectOf) as unknown as DOMRectList;
		};
		columns.appendChild(span);
	}
	document.body.appendChild(columns);
	return { columns, reads: () => reads };
}

/** `count` words flowing line by line from `page`, numbered from `first`. */
function flow(first: number, count: number, page = 0): Word[] {
	return Array.from({ length: count }, (_, i) => ({
		word: first + i,
		boxes: [
			{
				page: page + Math.floor(i / PER_PAGE),
				line: Math.floor((i % PER_PAGE) / WORDS_PER_LINE),
				slot: i % WORDS_PER_LINE,
			},
		],
	}));
}

afterEach(() => {
	document.body.innerHTML = "";
});

describe("readFirstVisibleWord", () => {
	it("returns the first word of the first, a middle and the last page", () => {
		const { columns } = layOut(flow(1000, 2000));
		expect(readFirstVisibleWord(columns, PAGE_WIDTH, 0)).toBe(1000);
		expect(readFirstVisibleWord(columns, PAGE_WIDTH, 7)).toBe(1000 + 7 * PER_PAGE);
		const lastPage = Math.floor(1999 / PER_PAGE);
		expect(readFirstVisibleWord(columns, PAGE_WIDTH, lastPage)).toBe(1000 + lastPage * PER_PAGE);
	});

	it("gives a word split across a column break to the page it starts on", () => {
		const words = flow(0, PER_PAGE - 1);
		words.push({
			word: PER_PAGE - 1,
			boxes: [
				{ page: 0, line: LINES_PER_PAGE - 1, slot: WORDS_PER_LINE - 1 },
				{ page: 1, line: 0, slot: 0 },
			],
		});
		words.push(
			...flow(PER_PAGE, 10, 1).map((w) => ({
				...w,
				boxes: [{ ...w.boxes[0], slot: w.boxes[0].slot + 1 }],
			})),
		);
		const { columns } = layOut(words);
		expect(readFirstVisibleWord(columns, PAGE_WIDTH, 0)).toBe(0);
		const first = readFirstVisibleWord(columns, PAGE_WIDTH, 1);
		expect(first).toBe(PER_PAGE);
		// A saved position must restore onto the page it was read from.
		expect(findPageForWord(columns, PAGE_WIDTH, 2, first ?? -1)).toBe(1);
	});

	it("returns null for a figure-only page and finds the page after it", () => {
		const { columns } = layOut([...flow(0, PER_PAGE), ...flow(PER_PAGE, PER_PAGE, 2)]);
		expect(readFirstVisibleWord(columns, PAGE_WIDTH, 1)).toBeNull();
		expect(readFirstVisibleWord(columns, PAGE_WIDTH, 2)).toBe(PER_PAGE);
	});

	it("picks the topmost-leftmost word when DOM order differs from visual order", () => {
		const words = flow(0, PER_PAGE);
		// Right-to-left first line on page 1: the DOM-first word sits rightmost.
		const rtl = Array.from({ length: WORDS_PER_LINE }, (_, i) => ({
			word: PER_PAGE + i,
			boxes: [{ page: 1, line: 0, slot: WORDS_PER_LINE - 1 - i }],
		}));
		const { columns } = layOut([...words, ...rtl]);
		expect(readFirstVisibleWord(columns, PAGE_WIDTH, 1)).toBe(PER_PAGE + WORDS_PER_LINE - 1);
	});

	it("returns null past the end and for an empty chunk", () => {
		expect(readFirstVisibleWord(layOut(flow(0, 100)).columns, PAGE_WIDTH, 40)).toBeNull();
		document.body.innerHTML = "";
		expect(readFirstVisibleWord(layOut([]).columns, PAGE_WIDTH, 0)).toBeNull();
	});

	it("reads about one page of rects, not every word before the page", () => {
		const { columns, reads } = layOut(flow(0, 2000));
		readFirstVisibleWord(columns, PAGE_WIDTH, 30);
		// log2(2000) for the search plus one page and the first word of the next.
		expect(reads()).toBeLessThanOrEqual(11 + PER_PAGE + 1);
	});
});
