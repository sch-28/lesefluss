import { buildEpubBuffer, type EpubFixture } from "@lesefluss/book-import/test-fixtures/build-epub";
import { expect, test } from "@playwright/test";
import { importEpubViaFilePicker, openBookFromLibrary, resetStorage } from "./helpers/seed";

const HEAD_SENTINEL = "Headsentinel alpha marker zero zero zero one.";
const TAIL_SENTINEL = "Tailsentinel zebra marker nine one seven three.";

/**
 * Build an EPUB whose extracted plain text exceeds the long-text chunk size
 * (512K chars), forcing the chunked write/read path in commitBookContent +
 * getBookContent rather than the single-statement fast path. A head and tail
 * sentinel let us prove the full content survives the chunk round-trip through
 * the real (sql.js) SQLite, not just the first chunk.
 */
function largeFixture(): EpubFixture {
	const filler = "Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod. ";
	const para = `<p>${filler.repeat(40)}</p>`; // ~2.8KB per paragraph
	const chapters: EpubFixture["chapters"] = [];
	for (let i = 1; i <= 24; i++) {
		const body = [
			i === 1 ? `<p>${HEAD_SENTINEL}</p>` : "",
			i === 24 ? `<p>${TAIL_SENTINEL}</p>` : "",
			para.repeat(10), // ~28KB/chapter -> ~670KB total, above the 512K chunk
		].join("\n");
		chapters.push({ id: `c${i}`, href: `c${i}.xhtml`, title: `Chapter ${i}`, body });
	}
	return { title: "Large Chunked Book", creator: "E2E", chapters };
}

test("imports a book larger than one chunk and reads head + tail content", async ({ page }) => {
	await resetStorage(page);
	const fixture = largeFixture();
	const buffer = await buildEpubBuffer(fixture);
	// Sanity: the plain text must exceed the 512K-char chunk to exercise chunking.
	expect(buffer.byteLength).toBeGreaterThan(512 * 1024);

	await importEpubViaFilePicker(page, {
		buffer,
		fileName: "large-chunked.epub",
		title: "Large Chunked Book",
	});

	await openBookFromLibrary(page, "Large Chunked Book");

	// Head content (first chunk) renders.
	await expect(page.getByText(HEAD_SENTINEL)).toBeVisible({ timeout: 10_000 });

	// Search scans the full reassembled content. Finding the tail sentinel (in the
	// last chapter, well past the first chunk) proves the chunked read returned the
	// whole book, not a truncated prefix, and that word offsets stayed coherent.
	await page.getByRole("button", { name: "Search content" }).click();
	const input = page.getByPlaceholder("Search in book…");
	await expect(input).toBeVisible();
	await input.fill("Tailsentinel");

	const firstResult = page.locator("ul li button", { hasText: "Tailsentinel" }).first();
	await expect(firstResult).toBeVisible({ timeout: 10_000 });
	await firstResult.click();

	await expect(page.locator("p.reader-paragraph", { hasText: TAIL_SENTINEL })).toBeInViewport({
		timeout: 5000,
	});
});
