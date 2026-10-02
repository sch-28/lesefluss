import { describe, expect, it } from "vitest";
import { buildFigureMap, type ImageMeta } from "./reader-figures";

const META: ImageMeta[] = [
	{ key: "/i/map.png", width: 100, height: 50, isLineArt: true },
	{ key: "/i/orn.png", width: 10, height: 10, isLineArt: false },
];
// Content: "# One\n\nFirst paragraph here.\n\nSecond paragraph here."
// Words: One(0 @2) First(1 @7) paragraph(2 @13) here.(3 @23) Second(4 @30) paragraph(5 @37) here.(6 @47)
const OFFSETS = [0, 7, 30];
const TOTAL = 7;
const WORD_BYTES = [2, 7, 13, 23, 30, 37, 47];
const byteOf = (w: number) => WORD_BYTES[Math.min(w, WORD_BYTES.length - 1)];
const build = (anchors: Parameters<typeof buildFigureMap>[1], meta = META) =>
	buildFigureMap("b1", anchors, meta, OFFSETS, TOTAL, byteOf);

describe("buildFigureMap", () => {
	it("places a figure above the paragraph starting at its word, even a heading paragraph", () => {
		const { byParagraph, trailing } = build([
			{ word: 0, key: "/i/map.png", alt: "map" },
			{ word: 1, key: "/i/orn.png", alt: "" },
			{ word: 4, key: "/i/orn.png", alt: "" },
		]);
		expect([...byParagraph.keys()]).toEqual([0, 1, 2]);
		expect(byParagraph.get(0)).toEqual([
			{
				id: 0,
				bookId: "b1",
				key: "/i/map.png",
				alt: "map",
				width: 100,
				height: 50,
				isLineArt: true,
			},
		]);
		expect(trailing).toEqual([]);
	});

	it("keeps several figures at one paragraph in anchor order", () => {
		const { byParagraph } = build([
			{ word: 1, key: "/i/map.png", alt: "" },
			{ word: 1, key: "/i/orn.png", alt: "" },
		]);
		expect(byParagraph.get(1)?.map((f) => f.key)).toEqual(["/i/map.png", "/i/orn.png"]);
	});

	it("puts an anchor inside a paragraph above that paragraph", () => {
		const { byParagraph } = build([{ word: 2, key: "/i/orn.png", alt: "" }]);
		expect([...byParagraph.keys()]).toEqual([1]);
	});

	it("treats an anchor at the word count as trailing", () => {
		const { byParagraph, trailing } = build([{ word: TOTAL, key: "/i/map.png", alt: "end" }]);
		expect(byParagraph.size).toBe(0);
		expect(trailing.map((f) => f.alt)).toEqual(["end"]);
	});

	it("drops anchors whose image is not stored on this device", () => {
		const { byParagraph, trailing } = build([
			{ word: 1, key: "/i/missing.png", alt: "" },
			{ word: TOTAL, key: "/i/missing.png", alt: "" },
		]);
		expect(byParagraph.size).toBe(0);
		expect(trailing).toEqual([]);
	});

	it("places an image before a heading that shares its floored start word with the previous paragraph", () => {
		// "Intro.\n\n# I\n\n## The Beginning\n\nText." Words: Intro.(0 @0) I(1 @10) The(2 @16) Beginning(3 @20) Text.(4 @31)
		const offsets = [0, 8, 13, 31];
		const bytes = [0, 10, 16, 20, 31];
		const { byParagraph } = buildFigureMap(
			"b1",
			[{ word: 1, key: "/i/map.png", alt: "" }],
			META,
			offsets,
			5,
			(w) => bytes[w],
		);
		expect([...byParagraph.keys()]).toEqual([1]);
	});

	it("returns an empty map for a book without images", () => {
		const { byParagraph, trailing } = build([], []);
		expect(byParagraph.size).toBe(0);
		expect(trailing).toEqual([]);
	});
});
