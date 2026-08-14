import { buildEpubBuffer, type EpubFixture } from "@lesefluss/book-import/test-fixtures/build-epub";
import { expect, test } from "@playwright/test";
import { importEpubViaFilePicker, resetStorage } from "./helpers/seed";

const TITLE = "Chapter Jump Book";
const CHAPTER_COUNT = 6;
const TARGET = 5;

const sentinel = (n: number) => `Sentinel marker for chapter ${n} appears exactly once.`;

/**
 * Chapters far enough apart that a wrong position is visible as a failure.
 *
 * The stray-anchor fixture is ~100 words, so every chapter sits in the viewport
 * at once and "landed on chapter 2" passes even when nothing was saved. This
 * one is ~1,200 words per chapter, so chapter 5 is only on screen if the jump
 * actually moved the reader there.
 */
function jumpFixture(): EpubFixture {
	const filler = `${"Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod. ".repeat(20)}`;
	const chapters: EpubFixture["chapters"] = [];
	for (let i = 1; i <= CHAPTER_COUNT; i++) {
		chapters.push({
			id: `c${i}`,
			href: `c${i}.xhtml`,
			title: `Chapter ${i}`,
			body: `<p>${sentinel(i)}</p>\n${`<p>${filler}</p>\n`.repeat(4)}`,
		});
	}
	return { title: TITLE, creator: "E2E", chapters };
}

/**
 * Jumping to a chapter from the book detail page.
 *
 * Distinct from toc-jump.spec.ts, which drives the reader's in-session TOC via
 * an imperative scroll. Here no reader is mounted: the tap writes
 * `books.wordPosition` and the seed effect resumes there on open, so this is
 * the half that has to survive a close and reopen.
 *
 * Covers the happy path only. The reverse case, a pre-migration book whose
 * chapter offsets are byte-scale and whose rows must stay disabled, cannot be
 * reached from here: the importer only ever writes word offsets, so seeding it
 * would need a database hook that does not exist. `hasWordAlignedChapters` is
 * unit-tested against the real offsets from both affected books instead.
 */
test("jumping to a chapter from book detail opens the reader there and persists it", async ({
	page,
}) => {
	await resetStorage(page);
	await importEpubViaFilePicker(page, {
		buffer: await buildEpubBuffer(jumpFixture()),
		fileName: "chapter-jump.epub",
		title: TITLE,
	});

	// Long-press opens the card menu on device; contextmenu is the same handler.
	// Targeted by the card's own attribute: a text lookup can resolve to a node
	// inside a closed-but-mounted sheet, where the press never reaches the card.
	await page.locator(`[data-book-title="${TITLE}"]`).first().click({ button: "right" });
	await page.getByRole("button", { name: "Details" }).click();
	await page.waitForURL(/\/tabs\/library\/book\//);

	// Scoped by heading: the "About this file" card also carries a Chapters row.
	const chapters = page
		.locator("section")
		.filter({ has: page.getByRole("heading", { name: /^Chapters/ }) });
	await expect(chapters).toBeVisible();

	const target = chapters.getByRole("button", { name: new RegExp(`Chapter ${TARGET}$`) });
	await expect(target).toBeEnabled();
	await target.click();

	await page.waitForURL(/\/tabs\/reader\//);
	await expect(page.getByText(sentinel(TARGET))).toBeInViewport({ timeout: 10_000 });
	// The discriminating half: chapter 1 is where an unwritten position lands.
	await expect(page.getByText(sentinel(1))).not.toBeInViewport();

	// Reopen from the library: proves the jump was persisted, not just scrolled.
	await page.goto("/tabs/library");
	await page.getByText(TITLE).first().click();
	await page.waitForURL(/\/tabs\/reader\//);
	await expect(page.getByText(sentinel(TARGET))).toBeInViewport({ timeout: 10_000 });
});
