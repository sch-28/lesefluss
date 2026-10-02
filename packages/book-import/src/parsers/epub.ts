import type { Book as EpubBook } from "epubjs";
import ePub from "epubjs";
import type { NavItem } from "epubjs/types/navigation";
import type {
	BookPayload,
	Chapter,
	ImportImage,
	ImportImageAnchor,
	ImportLink,
	Parser,
	PrepareImage,
} from "../types";
import { normalizeCover } from "../utils/cover-image";
import {
	type ContentImage,
	type ContentLink,
	extractParagraphsWithLinks,
} from "../utils/dom-paragraphs";
import { utf8ByteLength } from "../utils/encoding";
import { titleFromFileName } from "../utils/file-format";
import { MAX_DECODE_PIXELS, prepareImage, sniffImageDimensions } from "../utils/image-analysis";
import { assertBytes } from "../utils/raw-input";
import { canParseEpub } from "./matchers";

export const epubParser: Parser = {
	id: "epub",

	canParse: canParseEpub,

	async parse(input, onProgress, options): Promise<BookPayload> {
		assertBytes(input);
		const {
			content,
			title,
			author,
			coverImage,
			chapters,
			linkRanges,
			language,
			images,
			imageAnchors,
		} = await parseEpub(
			input.bytes,
			input.fileName,
			onProgress,
			options?.prepareImage ?? prepareImage,
		);

		return {
			content,
			title,
			author: author ?? null,
			coverImage,
			chapters,
			linkRanges,
			language,
			images,
			imageAnchors,
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

/** A body image whose bytes were loaded, positioned within its section's text. */
type SectionImage = { key: string; alt: string; charOffset: number };

/** Images larger than this are left out: one such row would dominate the
 *  book's storage and the SQLite bridge round-trip. */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
/**
 * Per-book ceilings. Every loaded image is held as a data URL until commit and
 * then becomes a SQLite row, so a zip full of highly compressible 4 MB images
 * must stop somewhere short of the WebView's heap. An illustrated novel has
 * tens of images; a comic or art book hits these limits and keeps its first N.
 */
const MAX_IMAGES_PER_BOOK = 500;
const MAX_IMAGE_BYTES_PER_BOOK = 64 * 1024 * 1024;
/** Anchor rows become one JSON column and one `<figure>` each. */
const MAX_IMAGE_ANCHORS_PER_BOOK = 2000;
/** Sources the archive cannot serve: remote URLs and inline data. */
const EXTERNAL_SRC_RE = /^(https?:|data:)/i;

/** A `# `…`###### ` markdown-style heading prefix at the start of a block. */
const HEADING_LINE_RE = /^#{1,6} /;

/**
 * Many EPUBs encode a chapter's title as an image (`<img alt="Chapter 1">`) or
 * leave it out of the body entirely, relying on the TOC alone. extractParagraphs
 * emits no `# ` heading line for those, so the reader (which renders chapter
 * headers from `# ` markers) shows no title after a TOC jump. When the section
 * maps to a TOC entry and has no heading of its own, prepend the TOC label as a
 * level-1 heading. Link offsets shift by the injected prefix length.
 */
function injectTocHeading(
	text: string,
	links: ContentLink[],
	images: SectionImage[],
	tocTitle: string | undefined,
): { text: string; links: ContentLink[]; images: SectionImage[] } {
	if (!tocTitle || HEADING_LINE_RE.test(text)) return { text, links, images };
	const prefix = `# ${tocTitle}\n\n`;
	return {
		text: prefix + text,
		links: links.map((l) => ({
			...l,
			startChar: l.startChar + prefix.length,
			endChar: l.endChar + prefix.length,
		})),
		images: images.map((img) => ({ ...img, charOffset: img.charOffset + prefix.length })),
	};
}

/**
 * Open an EPUB and wait for epubjs to be ready to answer questions about it.
 * Shared by the full parse and the metadata probe so both fail identically on a
 * file that isn't really an EPUB.
 */
async function openEpubBook(buffer: ArrayBuffer): Promise<EpubBook> {
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
		// The archive is already inflated in memory by this point, and a folder
		// scan runs this path once per unreadable file. `destroy` guards every
		// field, so it is safe before `ready` settles.
		book.destroy();
		throw err;
	} finally {
		if (timer !== undefined) clearTimeout(timer);
	}
	return book;
}

function readEpubMetadata(
	book: EpubBook,
	filename: string,
): { title: string; author: string | null; language: string | null } {
	const meta = book.packaging?.metadata;
	return {
		title: meta?.title || titleFromFileName(filename),
		author: meta?.creator || null,
		// `dc:language`, verbatim. Stored unnormalised: "en-GB" is as legitimate
		// as "en", and the dictionary lookup reduces it to a primary subtag itself.
		language: meta?.language?.trim() || null,
	};
}

/**
 * Title, author, and cover without touching the spine. A folder scan probes
 * every candidate file, and the section walk below is where all the time goes.
 */
export async function probeEpub(
	buffer: ArrayBuffer,
	filename: string,
): Promise<{ title: string; author: string | null; coverImage: string | null }> {
	const book = await openEpubBook(buffer);
	try {
		return { ...readEpubMetadata(book, filename), coverImage: await extractCover(book) };
	} finally {
		book.destroy();
	}
}

async function parseEpub(
	buffer: ArrayBuffer,
	filename: string,
	onProgress: ((pct: number) => void) | undefined,
	prepare: PrepareImage,
): Promise<{
	content: string;
	title: string;
	author: string | null;
	coverImage: string | null;
	chapters: Chapter[];
	linkRanges: ImportLink[] | null;
	language: string | null;
	images: ImportImage[] | null;
	imageAnchors: ImportImageAnchor[] | null;
}> {
	const book = await openEpubBook(buffer);
	const { title, author, language } = readEpubMetadata(book, filename);

	const coverImage = await extractCover(book);

	// NCX/nav docs nest chapters under parts via `subitems`, so walk the tree.
	const toc = await book.loaded.navigation;
	const tocMap = new Map<string, string>();
	const walkToc = (items: NavItem[]) => {
		for (const item of items) {
			const href = item.href?.split("#")[0];
			if (href && item.label) {
				// Collapse interior whitespace so a nav label with a stray newline
				// can't break the single-line `# ` heading invariant the reader and
				// injectTocHeading rely on (a `\n\n` would split it into two paragraphs).
				tocMap.set(href, item.label.replace(/\s+/g, " ").trim());
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
	// Images are keyed by resolved archive path so a file reused across
	// sections (chapter ornaments) is loaded and stored once. A section with
	// images but no text (a map page) contributes no section; its images wait in
	// `pendingImages` and anchor at the start of the next section with text, or
	// at the very end of the book.
	const sections: { text: string; href: string; links: ContentLink[]; images: SectionImage[] }[] =
		[];
	const imageStore = new ImageStore(book, prepare);
	let pendingImages: SectionImage[] = [];
	for (let i = 0; i < spineLength; i++) {
		const section = book.spine.get(i);
		try {
			if (!section?.url) continue;

			const body = await loadSectionBody(book, section.url);
			if (body) {
				const { content: text, links, images } = extractParagraphsWithLinks(body);
				const sectionImages = await imageStore.resolveAll(section.url, images);
				if (text.length > 0) {
					const headed = injectTocHeading(text, links, sectionImages, tocMap.get(section.href));
					sections.push({
						text: headed.text,
						href: section.href,
						links: headed.links,
						images: [...pendingImages.map((img) => ({ ...img, charOffset: 0 })), ...headed.images],
					});
					pendingImages = [];
				} else {
					pendingImages.push(...sectionImages);
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

	// Build chapters + link ranges + image anchors with correct UTF-8 byte offsets in one pass
	const chapters: Chapter[] = [];
	const linkRanges: ImportLink[] = [];
	const imageAnchors: ImportImageAnchor[] = [];
	let byteOffset = 0;
	for (let i = 0; i < sections.length; i++) {
		if (i > 0) byteOffset += 2; // \n\n separator (always 2 UTF-8 bytes)
		const sectionStart = byteOffset;

		const chapterTitle = tocMap.get(sections[i].href);
		if (chapterTitle) {
			chapters.push({ title: chapterTitle, startByte: byteOffset });
		}

		for (const link of sections[i].links) {
			linkRanges.push({
				href: link.href,
				startByte: sectionStart + utf8ByteLength(sections[i].text.slice(0, link.startChar)),
				endByte: sectionStart + utf8ByteLength(sections[i].text.slice(0, link.endChar)),
			});
		}
		for (const img of sections[i].images) {
			imageAnchors.push({
				key: img.key,
				alt: img.alt,
				startByte: sectionStart + utf8ByteLength(sections[i].text.slice(0, img.charOffset)),
			});
		}

		byteOffset += utf8ByteLength(sections[i].text);
	}
	for (const img of pendingImages) {
		imageAnchors.push({ key: img.key, alt: img.alt, startByte: byteOffset });
	}
	if (imageAnchors.length > MAX_IMAGE_ANCHORS_PER_BOOK) {
		console.warn(
			`[book-import/epub] ${imageAnchors.length} image anchors; keeping the first ${MAX_IMAGE_ANCHORS_PER_BOOK}`,
		);
		imageAnchors.length = MAX_IMAGE_ANCHORS_PER_BOOK;
	}

	const content = sections.map((s) => s.text).join("\n\n");
	const images = imageStore.list();

	book.destroy();

	return {
		content,
		title,
		author,
		coverImage,
		chapters,
		linkRanges: linkRanges.length > 0 ? linkRanges : null,
		language,
		images: images.length > 0 ? images : null,
		imageAnchors: imageAnchors.length > 0 ? imageAnchors : null,
	};
}

/**
 * Load specific body images from an EPUB by archive path, as stored in
 * `ImportImageAnchor.key`. For repairing a book whose image rows were lost
 * after import (the app was killed mid-write): the text is not re-parsed, only
 * the named zip entries are read, prepared and returned. Keys that cannot be
 * loaded are left out, like at import.
 */
export async function loadEpubImages(
	buffer: ArrayBuffer,
	keys: readonly string[],
	prepare: PrepareImage = prepareImage,
): Promise<ImportImage[]> {
	const book = await openEpubBook(buffer);
	try {
		const store = new ImageStore(book, prepare);
		for (const key of keys) await store.load(key);
		return store.list();
	} finally {
		book.destroy();
	}
}

/**
 * Loads each distinct body image from the archive once. Failures are
 * remembered too, so a broken reference met in forty chapters is tried once.
 * Past the per-book budget every further image resolves to null, like a
 * missing file, so the import still completes.
 */
class ImageStore {
	private readonly loaded = new Map<string, ImportImage | null>();
	private count = 0;
	private bytes = 0;
	private hasWarnedBudget = false;

	constructor(
		private readonly book: EpubBook,
		private readonly prepare: PrepareImage,
	) {}

	async resolveAll(sectionUrl: string, images: ContentImage[]): Promise<SectionImage[]> {
		const out: SectionImage[] = [];
		for (const img of images) {
			if (EXTERNAL_SRC_RE.test(img.src)) continue;
			const key = resolveArchivePath(sectionUrl, img.src);
			const stored = await this.load(key);
			if (stored) out.push({ key, alt: img.alt, charOffset: img.charOffset });
		}
		return out;
	}

	list(): ImportImage[] {
		return [...this.loaded.values()].filter((img): img is ImportImage => img !== null);
	}

	async load(key: string): Promise<ImportImage | null> {
		const cached = this.loaded.get(key);
		if (cached !== undefined) return cached;
		const image = await this.loadUncached(key);
		this.loaded.set(key, image);
		return image;
	}

	private isOverBudget(nextBytes: number): boolean {
		const over =
			this.count >= MAX_IMAGES_PER_BOOK || this.bytes + nextBytes > MAX_IMAGE_BYTES_PER_BOOK;
		if (over && !this.hasWarnedBudget) {
			this.hasWarnedBudget = true;
			console.warn("[book-import/epub] image budget reached; further images are skipped");
		}
		return over;
	}

	private async loadUncached(key: string): Promise<ImportImage | null> {
		if (this.isOverBudget(0)) return null;
		const declaredSize = zipEntryUncompressedSize(this.book, key);
		if (declaredSize !== null && declaredSize > MAX_IMAGE_BYTES) {
			console.warn(`[book-import/epub] image ${key} inflates to ${declaredSize} bytes; skipping`);
			return null;
		}
		let blob: Blob | null = null;
		try {
			blob = await this.book.archive.getBlob(key);
		} catch {
			blob = null;
		}
		if (!blob || blob.size === 0) {
			console.warn(`[book-import/epub] image ${key} not found in archive; skipping`);
			return null;
		}
		if (blob.size > MAX_IMAGE_BYTES) {
			console.warn(`[book-import/epub] image ${key} is ${blob.size} bytes; skipping`);
			return null;
		}
		const bytes = new Uint8Array(await blob.arrayBuffer());
		const size = sniffImageDimensions(bytes);
		// Over the decode cap nothing downscales it, and the reader's <img> would
		// then decode the full bitmap on every open.
		if (size && size.width * size.height > MAX_DECODE_PIXELS) {
			console.warn(`[book-import/epub] image ${key} is ${size.width}x${size.height}; skipping`);
			return null;
		}
		const prepared = await this.prepare(blob, size);
		if (this.isOverBudget(prepared.blob.size)) return null;
		const dataUrl = await blobToDataUrl(prepared.blob);
		if (!dataUrl) {
			console.warn(`[book-import/epub] image ${key} is not an image; skipping`);
			return null;
		}
		this.count++;
		this.bytes += prepared.blob.size;
		return {
			key,
			mime: dataUrl.slice("data:".length, dataUrl.indexOf(";")),
			dataUrl,
			width: prepared.width,
			height: prepared.height,
			isLineArt: prepared.isLineArt,
		};
	}
}

/**
 * Uncompressed size a zip entry declares, before inflating it. The byte cap
 * is checked on the inflated blob, so without this a 4 MB entry that inflates
 * to gigabytes would be inflated first. Reads JSZip's entry record through
 * epubjs; null when the shape is not there.
 */
function zipEntryUncompressedSize(book: EpubBook, key: string): number | null {
	const zip = (book.archive as { zip?: { file?: (name: string) => unknown } }).zip;
	const entry = zip?.file?.(key.replace(/^\//, "")) as
		| { _data?: { uncompressedSize?: unknown } }
		| null
		| undefined;
	const size = entry?._data?.uncompressedSize;
	return typeof size === "number" ? size : null;
}

/** Archive path of an image `src` written in `sectionUrl`. A root-absolute
 *  src (`/OEBPS/img/x.png`) names the zip root, not the section's folder. */
function resolveArchivePath(sectionUrl: string, src: string): string {
	const clean = src.split(/[#?]/)[0];
	return clean.startsWith("/") ? clean : resolveRelative(sectionUrl, clean);
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

const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|avif|svg)$/i;
const WRAPPER_EXT_RE = /\.(xhtml|html?)$/i;

/**
 * Collect candidate cover hrefs (relative to the OPF) in priority order. epubjs'
 * own `coverPath` only resolves the two standard declarations (EPUB3
 * `properties="cover-image"`, EPUB2 `<meta name="cover">`); many real files
 * declare the cover differently, so we fall back to scanning the manifest for a
 * cover-named image, then a cover-named page to unwrap. Deduped, order-preserving.
 */
function coverCandidateHrefs(book: EpubBook): string[] {
	const out: string[] = [];
	const push = (href?: string | null) => {
		if (href && !out.includes(href)) out.push(href);
	};

	push(book.packaging?.coverPath);

	const manifest = book.packaging?.manifest ?? {};
	const items = Object.entries(manifest).map(([id, item]) => ({ id, ...item }));
	const isImageType = (t?: string) => !!t && t.startsWith("image/");

	push(items.find((it) => it.properties?.includes("cover-image"))?.href);
	push(items.find((it) => /cover/i.test(it.id) && isImageType(it.type))?.href);
	push(
		items.find(
			(it) => /cover/i.test(it.href) && (isImageType(it.type) || IMAGE_EXT_RE.test(it.href)),
		)?.href,
	);
	// Last resort: a cover-named HTML/XHTML page that wraps the image.
	push(items.find((it) => /cover/i.test(it.href) && WRAPPER_EXT_RE.test(it.href))?.href);

	return out;
}

/** Resolve `rel` (an href inside `basePath`) to a full archive path, preserving
 *  the leading slash epubjs' resolved paths carry (getBlob expects that form). */
function resolveRelative(basePath: string, rel: string): string {
	if (/^(https?:|data:)/i.test(rel)) return rel;
	const absolute = basePath.startsWith("/");
	const baseDir = basePath.replace(/[^/]*$/, "");
	const parts = `${baseDir}${rel}`.split("/");
	const stack: string[] = [];
	for (const part of parts) {
		if (part === "" || part === ".") continue;
		if (part === "..") stack.pop();
		else stack.push(part);
	}
	return (absolute ? "/" : "") + stack.join("/");
}

function blobToDataUrl(blob: Blob): Promise<string | null> {
	return new Promise((resolve) => {
		const reader = new FileReader();
		reader.onloadend = () => {
			const result = reader.result;
			resolve(typeof result === "string" && result.startsWith("data:image") ? result : null);
		};
		reader.onerror = () => resolve(null);
		reader.readAsDataURL(blob);
	});
}

/** Find the first image referenced by a cover wrapper page (`<img>` or SVG `<image>`). */
async function findImageInWrapper(book: EpubBook, archivePath: string): Promise<string | null> {
	try {
		const result = await book.archive.request(archivePath, "xhtml");
		const doc = result as { querySelector?: (s: string) => Element | null };
		if (typeof doc.querySelector !== "function") return null;
		const img = doc.querySelector("img[src]");
		if (img) return img.getAttribute("src");
		const image = doc.querySelector("image");
		if (image) return image.getAttribute("xlink:href") ?? image.getAttribute("href");
		return null;
	} catch {
		return null;
	}
}

/**
 * Load `archivePath` as a cover data URL. If it points at an HTML/XHTML wrapper
 * page (a common cover.xhtml that embeds the real image), unwrap one level to
 * the embedded image. SVG images load directly (renderable in <img>).
 */
async function loadCoverDataUrl(
	book: EpubBook,
	archivePath: string,
	depth = 0,
): Promise<string | null> {
	if (depth > 2) return null;
	const cleanPath = archivePath.split(/[#?]/)[0];

	if (WRAPPER_EXT_RE.test(cleanPath)) {
		const innerHref = await findImageInWrapper(book, archivePath);
		if (!innerHref) return null;
		return loadCoverDataUrl(book, resolveRelative(archivePath, innerHref), depth + 1);
	}

	let blob: Blob | null = null;
	try {
		blob = await book.archive.getBlob(archivePath);
	} catch {
		return null;
	}
	if (!blob || blob.size === 0) return null;
	return blobToDataUrl(await normalizeCover(blob));
}

async function extractCover(book: EpubBook): Promise<string | null> {
	if (!book.archive?.getBlob) return null;
	for (const href of coverCandidateHrefs(book)) {
		let archivePath: string;
		try {
			archivePath = book.resolve(href);
		} catch {
			archivePath = href;
		}
		const dataUrl = await loadCoverDataUrl(book, archivePath);
		if (dataUrl) return dataUrl;
	}
	// A cover was declared but nothing usable loaded. Leave a trace, fall back to
	// the format placeholder in the UI (cover is cosmetic, never blocks import).
	if (book.packaging?.coverPath) {
		console.warn("[book-import/epub] cover declared but could not be loaded as an image");
	}
	return null;
}
