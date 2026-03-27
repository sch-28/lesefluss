import { Directory, Filesystem } from "@capacitor/filesystem";
import { FilePicker } from "@capawesome/capacitor-file-picker";
import type { Book as EpubBook } from "epubjs";
import ePub from "epubjs";
import { queries } from "../db/queries";
import type { Book, Chapter } from "../db/schema";

/** Directory within app data where original EPUB files are stored */
const BOOKS_DIR = "books";

/**
 * Open a file picker, parse the selected TXT or EPUB file, and save it to the
 * database. Calls `onProgress` (0–100) during EPUB spine processing.
 *
 * For EPUB files:
 *   - Plain text is extracted for RSVP/ESP32 transfer
 *   - Original EPUB is saved to Directory.Data/books/{id}.epub
 *   - Cover image is extracted as base64
 *   - Chapters are extracted as [{title, startByte}]
 *
 * Throws an Error with message "CANCELLED" if the user dismissed the picker.
 * Throws on parse or DB errors.
 */
export async function importBook(
	onProgress?: (pct: number) => void,
): Promise<Book> {
	// 1. Open the file picker
	const result = await FilePicker.pickFiles({
		types: ["text/plain", "application/epub+zip"],
		limit: 1,
		readData: true,
	});

	if (!result.files || result.files.length === 0) {
		throw new Error("CANCELLED");
	}

	const file = result.files[0];
	const isEpub = file.name.toLowerCase().endsWith(".epub");

	let content: string;
	let title: string;
	let author: string | undefined;
	let coverImage: string | null = null;
	let chapters: Chapter[] | null = null;

	if (isEpub && file.data) {
		({ content, title, author, coverImage, chapters } = await parseEpub(
			file.data,
			file.name,
			onProgress,
		));
	} else {
		// TXT: data is base64-encoded
		content = decodeBase64Utf8(file.data!);
		title = file.name.replace(/\.txt$/i, "");
	}

	// 2. Insert into DB (metadata + content)
	const id = await queries.addBookWithContent(
		{
			title,
			author: author ?? null,
			fileFormat: isEpub ? "epub" : "txt",
			filePath: null, // updated below for EPUB
			size: content.length,
			position: 0,
			addedAt: Date.now(),
			lastRead: null,
			slot: null,
		},
		content,
		coverImage,
		chapters,
	);

	// 3. Save original EPUB file to disk
	let filePath: string | null = null;
	if (isEpub && file.data) {
		filePath = `${BOOKS_DIR}/${id}.epub`;
		await ensureBooksDir();
		await Filesystem.writeFile({
			path: filePath,
			data: file.data,
			directory: Directory.Data,
		});
		// Update the book's filePath now that we have the id
		await queries.updateBook(id, { filePath });
	}

	return {
		id,
		title,
		author: author ?? null,
		fileFormat: isEpub ? "epub" : "txt",
		filePath,
		size: content.length,
		position: 0,
		slot: null,
		addedAt: Date.now(),
		lastRead: null,
	};
}

/**
 * Remove a book: delete the file from disk (if it exists) then delete DB rows.
 */
export async function removeBook(
	book: Pick<Book, "id" | "filePath">,
): Promise<void> {
	// Delete file from disk first
	if (book.filePath) {
		try {
			await Filesystem.deleteFile({
				path: book.filePath,
				directory: Directory.Data,
			});
		} catch (err) {
			// File may already be gone — log but don't fail
			console.warn("Failed to delete book file:", err);
		}
	}

	// Delete from DB (content + metadata)
	await queries.deleteBook(book.id);
}

/**
 * Ensure the books/ directory exists in app data.
 */
async function ensureBooksDir(): Promise<void> {
	try {
		await Filesystem.mkdir({
			path: BOOKS_DIR,
			directory: Directory.Data,
			recursive: true,
		});
	} catch {
		// Directory may already exist — that's fine
	}
}

/**
 * Decode a base64 string to a UTF-8 string.
 * The FilePicker returns file data as base64 when readData=true.
 */
function decodeBase64Utf8(base64: string): string {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return new TextDecoder("utf-8").decode(bytes);
}

/**
 * Parse an EPUB from base64 data.
 * - Extracts plain text by walking spine items and stripping HTML
 * - Tracks chapter boundaries as byte offsets into the plain text
 * - Extracts cover image as base64
 * - Extracts title/author from metadata
 *
 * Uses epubjs which runs fine in Capacitor's WebView.
 */
async function parseEpub(
	base64Data: string,
	filename: string,
	onProgress?: (pct: number) => void,
): Promise<{
	content: string;
	title: string;
	author?: string;
	coverImage: string | null;
	chapters: Chapter[];
}> {
	// Convert base64 → ArrayBuffer
	const binary = atob(base64Data);
	const buffer = new ArrayBuffer(binary.length);
	const view = new Uint8Array(buffer);
	for (let i = 0; i < binary.length; i++) {
		view[i] = binary.charCodeAt(i);
	}

	const book = ePub(buffer);
	await book.ready;

	// Extract metadata — epubjs types PackagingMetadataObject are correct here
	const meta = book.packaging?.metadata;
	const title = meta?.title || filename.replace(/\.epub$/i, "");
	const author = meta?.creator;

	// Extract cover image
	const coverImage = await extractCover(book);

	// Build TOC lookup: spine href → chapter title
	const toc = await book.loaded.navigation;
	const tocMap = new Map<string, string>();
	if (toc?.toc) {
		for (const item of toc.toc) {
			// TOC href may have fragment (#id) — strip it for matching
			const href = item.href?.split("#")[0];
			if (href && item.label) {
				tocMap.set(href, item.label.trim());
			}
		}
	}

	// Walk the spine to collect plain text + chapter boundaries.
	// spine.each() is typed and iterates Section objects directly — we use it to
	// get the count, then spine.get(i) for async loading.
	let sectionCount = 0;

	// spine.each() doesn't provide a total count, so we need the length for progress.
	// spine.length is not typed but exists at runtime — fall back to no-progress if missing.
	const spineLength =
		(book.spine as unknown as { length?: number }).length ?? 0;

	book.spine.each(() => {
		sectionCount++;
	});

	// Reset and do actual async work via spine.get() which is properly typed
	const sections: { text: string; href: string }[] = [];
	for (let i = 0; i < sectionCount; i++) {
		try {
			const section = book.spine.get(i);
			if (!section) continue;

			// section.load() returns Promise at runtime (types say Document — wrong)
			await (section.load(book.load.bind(book)) as unknown as Promise<unknown>);
			const doc = section.document;
			if (doc?.body) {
				const text = (doc.body.textContent || "")
					.replace(/\s+/g, " ")
					.trim();
				if (text.length > 0) {
					sections.push({ text, href: section.href });
				}
			}
			section.unload();
		} catch (err) {
			console.warn(`EPUB: failed to load spine item ${i}`, err);
		}

		if (spineLength > 0) {
			onProgress?.(Math.round(((i + 1) / spineLength) * 100));
		}
	}

	// Build chapters with correct byte offsets in one pass
	const chapters: Chapter[] = [];
	let byteOffset = 0;
	for (let i = 0; i < sections.length; i++) {
		if (i > 0) byteOffset += 2; // \n\n separator

		const chapterTitle = tocMap.get(sections[i].href);
		if (chapterTitle) {
			chapters.push({ title: chapterTitle, startByte: byteOffset });
		}

		byteOffset += sections[i].text.length;
	}

	const content = sections.map((s) => s.text).join("\n\n");

	book.destroy();

	return { content, title, author, coverImage, chapters };
}

/**
 * Attempt to extract the cover image from an EPUB as a base64 data URL.
 * Returns null if no cover is found or extraction fails.
 */
async function extractCover(book: EpubBook): Promise<string | null> {
	try {
		const coverUrl = await book.loaded.cover;
		if (!coverUrl) return null;

		// epubjs gives us a relative URL to the cover within the EPUB archive.
		// We need to load it as a blob via the book's archive.
		const archive = book.archive;
		if (!archive?.getBlob) return null;

		const blob = await archive.getBlob(coverUrl);
		if (!blob || blob.size === 0) return null;

		// Convert blob to base64 data URL
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
	} catch (err) {
		console.warn("EPUB: failed to extract cover image:", err);
		return null;
	}
}
