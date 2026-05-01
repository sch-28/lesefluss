import type { Book as EpubBook } from "epubjs";
import ePub from "epubjs";
import type { BookPayload, Chapter, Parser } from "../types";
import { extractParagraphs } from "../utils/dom-paragraphs";
import { utf8ByteLength } from "../utils/encoding";
import { assertBytes } from "../utils/raw-input";
import { canParseEpub } from "./matchers";

export const epubParser: Parser = {
	id: "epub",

	canParse: canParseEpub,

	async parse(input, onProgress): Promise<BookPayload> {
		assertBytes(input);
		const { content, title, author, coverImage, chapters } = await parseEpub(
			input.bytes,
			input.fileName,
			onProgress,
		);

		return {
			content,
			title,
			author: author ?? null,
			coverImage,
			chapters,
			fileFormat: "epub",
			original: { bytes: input.bytes, extension: "epub" },
		};
	},
};

/**
 * Parse an EPUB from an ArrayBuffer.
 * - Extracts plain text by walking spine items and stripping HTML
 * - Tracks chapter boundaries as UTF-8 byte offsets into the plain text
 * - Extracts cover image as base64
 * - Extracts title/author from metadata
 */
async function parseEpub(
	buffer: ArrayBuffer,
	filename: string,
	onProgress?: (pct: number) => void,
): Promise<{
	content: string;
	title: string;
	author?: string;
	coverImage: string | null;
	chapters: Chapter[];
}> {
	const book = ePub(buffer);
	await book.ready;

	const meta = book.packaging?.metadata;
	const title = meta?.title || filename.replace(/\.epub$/i, "");
	const author = meta?.creator;

	const coverImage = await extractCover(book);

	// Build TOC lookup: spine href → chapter title
	const toc = await book.loaded.navigation;
	const tocMap = new Map<string, string>();
	if (toc?.toc) {
		for (const item of toc.toc) {
			const href = item.href?.split("#")[0];
			if (href && item.label) {
				tocMap.set(href, item.label.trim());
			}
		}
	}

	// spine.length is not typed but exists at runtime; fall back to counting via
	// spine.each() if it's missing so progress reporting still works.
	let spineLength = (book.spine as unknown as { length?: number }).length ?? 0;
	if (spineLength === 0) {
		book.spine.each(() => {
			spineLength++;
		});
	}

	const sections: { text: string; href: string }[] = [];
	for (let i = 0; i < spineLength; i++) {
		try {
			const section = book.spine.get(i);
			if (!section) continue;

			// section.load() returns Promise at runtime (types say Document - wrong)
			await (section.load(book.load.bind(book)) as unknown as Promise<unknown>);
			const doc = section.document;
			if (doc?.body) {
				const text = extractParagraphs(doc.body);
				if (text.length > 0) {
					sections.push({ text, href: section.href });
				}
			}
			section.unload();
		} catch {
			// Skip unreadable spine items; partial content is better than aborting
			// otherwise valid EPUB imports.
		}

		onProgress?.(Math.round(((i + 1) / spineLength) * 100));
	}

	// Build chapters with correct UTF-8 byte offsets in one pass
	const chapters: Chapter[] = [];
	let byteOffset = 0;
	for (let i = 0; i < sections.length; i++) {
		if (i > 0) byteOffset += 2; // \n\n separator (always 2 UTF-8 bytes)

		const chapterTitle = tocMap.get(sections[i].href);
		if (chapterTitle) {
			chapters.push({ title: chapterTitle, startByte: byteOffset });
		}

		byteOffset += utf8ByteLength(sections[i].text);
	}

	const content = sections.map((s) => s.text).join("\n\n");

	book.destroy();

	return { content, title, author, coverImage, chapters };
}

async function extractCover(book: EpubBook): Promise<string | null> {
	try {
		const coverUrl = await book.loaded.cover;
		if (!coverUrl) return null;

		const archive = book.archive;
		if (!archive?.getBlob) return null;

		const blob = await archive.getBlob(coverUrl);
		if (!blob || blob.size === 0) return null;

		return new Promise<string | null>((resolve) => {
			const reader = new FileReader();
			reader.onloadend = () => {
				const result = reader.result;
				if (typeof result === "string" && result.startsWith("data:")) {
					resolve(result);
				} else {
					resolve(null);
				}
			};
			reader.onerror = () => resolve(null);
			reader.readAsDataURL(blob);
		});
	} catch {
		return null;
	}
}
