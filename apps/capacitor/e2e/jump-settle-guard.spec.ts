import { expect, test } from "@playwright/test";
import { openBookFromLibrary, seedStrayAnchorBook } from "./helpers/seed";
import { reader } from "./page-objects/reader";

/**
 * Regression for the jump → scroll-settle race: after a TOC jump,
 * `handleScrollPositionSettle` was overwriting the jumped position with the
 * viewport-top word (still inside the previous chapter on tall scroll
 * viewports). reader/index.tsx now stamps `lastJumpAtRef` in `jumpToWord` and
 * skips settles within `JUMP_SETTLE_GUARD_MS = 1500ms`. A jump only browses, so
 * the position that must survive is the one "Read from here" commits.
 */
test("scroll-settle after a TOC jump must not rewind the committed word position", async ({
	page,
}) => {
	const title = await seedStrayAnchorBook(page);
	await openBookFromLibrary(page, title);

	await reader.tocJumpToChapter(page, "2: Second");
	await expect(page.locator("h2", { hasText: "TITLE 2" })).toBeInViewport({ timeout: 5000 });
	await reader.waitPastJumpGuard(page);

	const savePending = reader.waitForNextSave(page);
	await reader.readFromHere(page);
	await savePending;

	// The chapter starts at its heading words, just before the opening
	// paragraph; a stomping settle lands further back, inside chapter 1.
	const openingWord = await reader.firstWordPositionIn(
		page.getByText("Chapter 2 opening paragraph anchors the scene."),
	);
	const saved = await reader.lastSavedWord(page);
	expect(saved).toBeGreaterThanOrEqual(openingWord - 5);
	expect(saved).toBeLessThanOrEqual(openingWord);
});
