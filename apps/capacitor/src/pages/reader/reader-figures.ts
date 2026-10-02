import { paragraphIndexForWord } from "@lesefluss/core";
import type { ImageAnchor } from "../../services/db/schema";

/** One body image to render, metadata only: the bytes load per figure. */
export type ReaderFigureData = {
	/** Index of the anchor in the book's anchor list; unique per figure. */
	id: number;
	bookId: string;
	key: string;
	alt: string;
	width: number;
	height: number;
	isLineArt: boolean;
};

export type ImageMeta = Pick<ReaderFigureData, "key" | "width" | "height" | "isLineArt">;

export type FigureMap = {
	/** Paragraph index → figures rendered above that paragraph. */
	byParagraph: Map<number, ReaderFigureData[]>;
	/** Figures anchored past the last word, rendered after the last paragraph. */
	trailing: ReaderFigureData[];
};

const EMPTY: FigureMap = { byParagraph: new Map(), trailing: [] };

/**
 * Place each stored image above the paragraph that contains its anchor byte.
 * Anchors are the first word at or after the image, while a paragraph's start
 * word is floored (a `# ` heading with no word at its first byte starts at the
 * previous paragraph's last word), so the two cannot be compared as words:
 * the paragraph is found by the anchor word's byte against paragraph offsets.
 * An anchor at or past the word count is a trailing image. Anchors with no
 * stored metadata (bytes not on this device) are dropped.
 */
export function buildFigureMap(
	bookId: string,
	anchors: readonly ImageAnchor[],
	images: readonly ImageMeta[],
	paragraphOffsets: readonly number[],
	totalWords: number,
	byteOfWord: (word: number) => number,
): FigureMap {
	if (anchors.length === 0 || images.length === 0 || paragraphOffsets.length === 0) return EMPTY;
	const metaByKey = new Map(images.map((img) => [img.key, img]));
	const byParagraph = new Map<number, ReaderFigureData[]>();
	const trailing: ReaderFigureData[] = [];
	for (let i = 0; i < anchors.length; i++) {
		const anchor = anchors[i];
		const meta = metaByKey.get(anchor.key);
		if (!meta) continue;
		const figure: ReaderFigureData = { id: i, bookId, alt: anchor.alt, ...meta };
		if (anchor.word >= totalWords) {
			trailing.push(figure);
			continue;
		}
		const idx = paragraphIndexForWord(paragraphOffsets, byteOfWord(anchor.word));
		const list = byParagraph.get(idx);
		if (list) list.push(figure);
		else byParagraph.set(idx, [figure]);
	}
	return { byParagraph, trailing };
}
