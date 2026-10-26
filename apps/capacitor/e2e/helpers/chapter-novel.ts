import {
	type EpubFixture,
	PORTRAIT_PNG_BASE64,
} from "@lesefluss/book-import/test-fixtures/build-epub";
import type { Page } from "@playwright/test";
import { seedFixture } from "./seed";

/** Five chapters, each opening with a heading (h1 or h2) and 40 paragraphs. */
export const CHAPTER_NOVEL_TITLE = "Chapter Novel";
export const CHAPTERS = 5;
export const PARAS_PER_CHAPTER = 40;

export function chapterHeading(n: number): string {
	return `Chapter Heading ${n}`;
}

export function openingPhrase(n: number): string {
	return `Opening${n} words begin chapter ${n} here`;
}

type NovelOptions = {
	headingTag?: "h1" | "h2";
	/** Ends every chapter with a tall figure, which in page mode pushes the next heading a page on. */
	endFigure?: boolean;
};

export function chapterNovelFixture({
	headingTag = "h2",
	endFigure = false,
}: NovelOptions = {}): EpubFixture {
	const chapters = [];
	for (let c = 1; c <= CHAPTERS; c++) {
		const paras: string[] = [`<${headingTag}>${chapterHeading(c)}</${headingTag}>`];
		for (let p = 1; p <= PARAS_PER_CHAPTER; p++) {
			const lead = p === 1 ? `${openingPhrase(c)}.` : `Marker${c}x${p} in chapter ${c}.`;
			paras.push(
				`<p>${lead} The river bent slowly around the old mill while the evening light faded over the quiet fields and somebody far away kept humming the same tune ending${c}x${p}.</p>`,
			);
		}
		if (endFigure) {
			paras.push(
				`<div class="figure"><img alt="End of chapter ${c}" src="images/tall.png"/></div>`,
			);
		}
		chapters.push({
			id: `c${c}`,
			href: `c${c}.xhtml`,
			title: `Chapter ${c}`,
			body: paras.join(""),
		});
	}
	return {
		title: CHAPTER_NOVEL_TITLE,
		chapters,
		navPoints: chapters.map((ch, i) => ({ label: `Chapter ${i + 1}`, href: ch.href })),
		images: endFigure
			? [{ href: "images/tall.png", base64: PORTRAIT_PNG_BASE64, mediaType: "image/png" }]
			: undefined,
	};
}

export async function seedChapterNovel(page: Page, options: NovelOptions = {}): Promise<string> {
	return seedFixture(page, chapterNovelFixture(options), "chapter-novel.epub");
}
