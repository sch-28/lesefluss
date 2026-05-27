import type { Book as EpubBook } from "epubjs";
import ePub from "epubjs";
import type { NavItem } from "epubjs/types/navigation";
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
/** Empty / partial-header EPUB inputs caused epubjs + JSZip to hang at
 *  `book.ready` indefinitely (Importing… stuck forever). Fail fast on bytes
 *  that obviously aren't a zip, and bound the time we'll wait on a maybe-zip
 *  that's actually malformed inside.
 */
const EPUB_READY_TIMEOUT_MS = 15_000;

function assertLooksLikeZip(buffer: ArrayBuffer): void {
	if (buffer.byteLength < 4) throw new Error("EPUB_INVALID");
	const head = new Uint8Array(buffer, 0, 4);
	// ZIP local-file header magic: PK\x03\x04
	if (head[0] !== 0x50 || head[1] !== 0x4b || head[2] !== 0x03 || head[3] !== 0x04) {
		throw new Error("EPUB_INVALID");
	}
}

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
	assertLooksLikeZip(buffer);
	const book = ePub(buffer);
	// Race the parser ready against a timeout. Clear the timeout when ready
	// wins so we don't leak a 15s pending setTimeout for every successful
	// import. After a timeout-loss, attach a sink `.catch` to `book.ready` so
	// the abandoned promise's eventual rejection doesn't surface as an
	// unhandled-rejection warning.
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			book.ready,
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new Error("EPUB_INVALID")), EPUB_READY_TIMEOUT_MS);
			}),
		]);
	} catch (err) {
		book.ready.catch(() => undefined);
		throw err;
	} finally {
		if (timer !== undefined) clearTimeout(timer);
	}

	const meta = book.packaging?.metadata;
	const title = meta?.title || filename.replace(/\.epub$/i, "");
	const author = meta?.creator;

	const coverImage = await extractCover(book);

	// NCX/nav docs nest chapters under parts via `subitems`, so walk the tree.
	const toc = await book.loaded.navigation;
	const tocMap = new Map<string, string>();
	const walkToc = (items: NavItem[]) => {
		for (const item of items) {
			const href = item.href?.split("#")[0];
			if (href && item.label) {
				tocMap.set(href, item.label.trim());
			}
			if (item.subitems?.length) {
				walkToc(item.subitems);
			}
		}
	};
	if (toc?.toc) {
		walkToc(toc.toc);
	}

	// spine.length is not typed but exists at runtime; fall back to counting via
	// spine.each() if it's missing so progress reporting still works.
	let spineLength = (book.spine as unknown as { length?: number }).length ?? 0;
	if (spineLength === 0) {
		book.spine.each(() => {
			spineLength++;
		});
	}

	// Fetch each spine item as XHTML. epubjs picks the parser mime from the file
	// extension, so `.htm`/`.html` chapters get parsed as text/html. EPUB2
	// chapters routinely contain self-closed page anchors (`<a id="pageN"/>`)
	// that HTML5's adoption-agency algorithm reshuffles out of `<body>`'s direct
	// children in strict parsers (Chromium WebView), silently dropping most
	// paragraphs. Forcing xhtml mime sidesteps it.
	const sections: { text: string; href: string }[] = [];
	for (let i = 0; i < spineLength; i++) {
		const section = book.spine.get(i);
		try {
			if (!section?.url) continue;

			const body = await loadSectionBody(book, section.url);
			if (body) {
				const text = extractParagraphs(body);
				if (text.length > 0) {
					sections.push({ text, href: section.href });
				}
			}
			section.unload();
		} catch (err) {
			// Partial content beats aborting a valid EPUB, but a silent drop is
			// what masked the Golden Son truncation bug for hours. Warn so
			// missing chapters leave a trace.
			console.warn(`[book-import/epub] skipped spine[${i}] (${section?.href ?? "?"}):`, err);
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

async function loadSectionBody(book: EpubBook, url: string): Promise<Element | null> {
	const result = await book.archive.request(url, "xhtml");
	// Duck-type by callable `querySelector`. `instanceof Document` would be
	// stricter but fails in happy-dom/jsdom where the parser's Document doesn't
	// match the global one. archive.request with type="xhtml" routes through
	// `parse(text, "application/xhtml+xml")` which only returns a Document-shape.
	if (!result || typeof (result as { querySelector?: unknown }).querySelector !== "function") {
		console.warn(`[book-import/epub] section ${url} returned non-Document shape; skipping`);
		return null;
	}
	const body = (result as Document).querySelector("body");
	if (!body) {
		console.warn(`[book-import/epub] section ${url} has no <body>; skipping`);
	}
	return body;
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
