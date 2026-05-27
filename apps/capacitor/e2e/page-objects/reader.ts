import { expect, type Locator, type Page } from "@playwright/test";

export type HighlightColor = "yellow" | "blue" | "orange" | "pink";

/**
 * Drag the mouse from `from` to `to` with a > 8px intermediate step so the
 * reader's `paragraph.tsx` onPointerDown handler routes the gesture into
 * `onWordMouseDragStart` (the desktop selection path).
 */
async function mouseDragRange(
	page: Page,
	from: { x: number; y: number },
	to: { x: number; y: number },
): Promise<void> {
	const startMid = { x: from.x + 2, y: from.y };
	const tripDrag = { x: from.x + 20, y: from.y };
	await page.mouse.move(startMid.x, startMid.y);
	await page.mouse.down();
	await page.mouse.move(tripDrag.x, tripDrag.y);
	await page.mouse.move(to.x - 2, to.y, { steps: 5 });
	await page.mouse.up();
}

/**
 * Reader page object. Hides DOM details (aria-labels, `data-word` attributes,
 * mouse-drag selection rules, the appearance popover layout) behind a
 * domain-shaped interface.
 *
 * Position is always in canonical Word position units (ADR-0002). Methods that
 * report a position return its numeric `data-word` value; spec code should not
 * read the attribute directly.
 */
export const reader = {
	expectLoaded: async (page: Page) => {
		await page.waitForURL(/\/tabs\/reader\//);
		await expect(page.locator("span[data-word]").first()).toBeVisible();
	},

	/**
	 * Locator for a word span by visible text. Returns the FIRST attached match;
	 * relies on the reader's virtual-list (virtua) only mounting on-screen
	 * paragraphs — off-screen duplicates of the same word never enter the DOM,
	 * so `.first()` is the visible one. If a future view drops virtualization,
	 * pass a scoped container instead.
	 */
	wordSpan: (page: Page, text: string): Locator =>
		page.locator("span[data-word]", { hasText: text }).first(),

	wordPositionOf: async (page: Page, text: string): Promise<number> => {
		const attr = await reader.wordSpan(page, text).getAttribute("data-word");
		if (!attr) throw new Error(`No data-word attr on span with text "${text}"`);
		return Number.parseInt(attr, 10);
	},

	tocJumpToChapter: async (page: Page, label: string) => {
		await page.getByRole("button", { name: "Annotations" }).click();
		await page.getByRole("button", { name: label }).click();
	},

	/** Mouse-drag select from startText to endText. Mouse path bypasses the
	 *  touch long-press timer (paragraph.tsx: long-press is touch-only). */
	selectWords: async (page: Page, startText: string, endText: string) => {
		const startBox = await reader.wordSpan(page, startText).boundingBox();
		const endBox = await reader.wordSpan(page, endText).boundingBox();
		if (!startBox || !endBox) throw new Error("Could not locate word bounding boxes");
		await mouseDragRange(
			page,
			{ x: startBox.x, y: startBox.y + startBox.height / 2 },
			{ x: endBox.x + endBox.width, y: endBox.y + endBox.height / 2 },
		);
	},

	applyHighlight: async (page: Page, color: HighlightColor): Promise<number> => {
		const swatch = page.getByRole("button", { name: `Highlight ${color}` });
		await expect(swatch).toBeVisible({ timeout: 5000 });
		await swatch.click();
		const highlighted = page.locator(`span.word-highlight-${color}`).first();
		await expect(highlighted).toBeVisible();
		const attr = await highlighted.getAttribute("data-word");
		if (!attr) throw new Error("Highlighted span has no data-word");
		return Number.parseInt(attr, 10);
	},

	expectHighlight: async (page: Page, wordPosition: number, color: HighlightColor) => {
		await expect(
			page.locator(`span[data-word="${wordPosition}"].word-highlight-${color}`),
		).toBeVisible({ timeout: 10_000 });
	},

	/**
	 * Dismiss the selection toolbar that the apply-highlight flow leaves up.
	 * Reader's selection state must be cleared before another mouse-drag can
	 * route to `openHighlightEditor` instead of extending the live selection.
	 */
	cancelSelection: async (page: Page) => {
		const cancelBtn = page.getByRole("button", { name: "Cancel selection" });
		// Fast probe: if the toolbar isn't rendered, the count is 0 and there's
		// nothing to cancel. Avoids the prior `.isVisible().catch(() => false)`
		// pattern that swallowed real errors.
		if ((await cancelBtn.count()) > 0) {
			await cancelBtn.click();
		}
	},

	expectNoHighlight: async (page: Page, wordPosition: number) => {
		const cls = (await page.locator(`span[data-word="${wordPosition}"]`).getAttribute("class")) ?? "";
		if (cls.includes("word-highlight-")) {
			throw new Error(`word ${wordPosition} still highlighted (class: ${cls})`);
		}
	},

	/**
	 * Open the editor for an existing highlight by starting a mouse-drag on the
	 * highlighted span. Reader's `handleWordMouseDragStart` short-circuits to
	 * `openHighlightEditor` when the underlying word is already in a highlight.
	 */
	openHighlightEditor: async (page: Page, wordPosition: number) => {
		const span = page.locator(`span[data-word="${wordPosition}"]`);
		const box = await span.boundingBox();
		if (!box) throw new Error(`No bounding box for word ${wordPosition}`);
		// Mouse-drag with a > 8px move so paragraph.tsx routes the gesture into
		// `handleWordMouseDragStart` → `openHighlightEditor` for existing
		// highlights. End point is on the same span so the drag stays inside.
		await mouseDragRange(
			page,
			{ x: box.x, y: box.y + box.height / 2 },
			{ x: box.x + 20, y: box.y + box.height / 2 },
		);
	},

	deleteHighlightFromEditor: async (page: Page) => {
		await page.getByRole("button", { name: "Delete highlight" }).click();
	},

	/**
	 * Click the inline avatar's parent word to reopen the glossary editor.
	 * Reader's `handleWordTap` routes glossary-decorated words straight to
	 * `setEditingGlossaryEntry`. Pass the WordPosition of the avatar word.
	 */
	openGlossaryEditor: async (page: Page, wordPosition: number) => {
		const span = page.locator(`span[data-word="${wordPosition}"]`).first();
		// dispatchEvent('click') bypasses Playwright's actionability + the
		// paragraph long-press preventDefault dance. React's delegated onClick
		// listener picks it up off the bubbled native event.
		await span.dispatchEvent("click");
		// Wait for the drawer to mount.
		await page.getByRole("heading", { name: "Glossary entry" }).waitFor({ state: "visible", timeout: 5000 });
	},

	setGlossaryLabelFromEditor: async (page: Page, label: string) => {
		const drawer = page.getByRole("dialog").filter({ hasText: "Glossary entry" });
		const labelBtn = drawer.locator("button.flex-1.truncate");
		await labelBtn.waitFor({ state: "visible" });
		// Call the element's native .click() inside the page; bypasses
		// Playwright viewport checks AND fires React's delegated onClick.
		await labelBtn.evaluate((el: HTMLElement) => el.click());
		const input = drawer.getByPlaceholder("Name");
		await input.fill(label);
		await input.blur();
	},

	deleteGlossaryFromEditor: async (page: Page) => {
		const drawer = page.getByRole("dialog").filter({ hasText: "Glossary entry" });
		const btn = drawer.getByRole("button", { name: "Delete entry" });
		await btn.waitFor({ state: "visible" });
		await btn.evaluate((el: HTMLElement) => el.click());
	},

	setHighlightNoteFromEditor: async (page: Page, note: string) => {
		const ta = page.getByPlaceholder("Add a note…");
		await ta.fill(note);
		// Highlight modal persists the note on textarea `blur` via a
		// fire-and-forget `updateHighlightMutation.mutate(...)`. Explicit blur
		// triggers the save, then a brief wait lets the IDB transaction flush
		// before any subsequent page.goto kills the JS context.
		await ta.blur();
		await page.waitForTimeout(150);
	},

	changeHighlightColorFromEditor: async (page: Page, color: HighlightColor) => {
		// Modal AND selection toolbar both render `aria-label="Highlight {color}"`
		// swatches. Caller is expected to have called `cancelSelection` first so
		// the toolbar is gone and only the modal swatch matches.
		await page.getByRole("button", { name: `Highlight ${color}` }).click();
	},

	// ── Mode switching ───────────────────────────────────────────────────
	toggleRsvp: async (page: Page) => {
		await page.getByRole("button", { name: /Switch to (RSVP|standard) reader/ }).click();
	},

	// ── RSVP playback ────────────────────────────────────────────────────
	/** Click the RSVP display to flip play/pause. */
	rsvpTogglePlay: async (page: Page) => {
		await page.locator(".rsvp-display").click();
	},

	rsvpIsPlaying: async (page: Page): Promise<boolean> => {
		const cls = (await page.locator(".rsvp-display").getAttribute("class")) ?? "";
		return !cls.includes("rsvp-display--paused");
	},

	rsvpCurrentWord: async (page: Page): Promise<string> => {
		const before = (await page.locator(".rsvp-before").textContent()) ?? "";
		const focal = (await page.locator(".rsvp-focal").textContent()) ?? "";
		const after = (await page.locator(".rsvp-after").textContent()) ?? "";
		return `${before}${focal}${after}`;
	},

	setPaginationStyle: async (page: Page, style: "scroll" | "page") => {
		await page.getByRole("button", { name: "Appearance settings" }).click();
		const label = style === "scroll" ? "Scroll" : "Page";
		await page.getByRole("radio", { name: label, exact: true }).click();
		await page.keyboard.press("Escape");
		// Wait for the new view's word spans to re-mount; the prior ad-hoc 300ms
		// sleep raced this on slow CI.
		await expect(page.locator("span[data-word]").first()).toBeVisible({ timeout: 5000 });
	},

	/**
	 * Read the saved word position from the dev-only window hook the reader
	 * publishes at the tail of every `savePosition()`. Throws if no save has
	 * happened yet so tests can't accidentally compare against an uninitialised
	 * sentinel.
	 */
	lastSavedWord: async (page: Page): Promise<number> => {
		const word = await page.evaluate(() => window.__lesefluss_e2e_save?.word ?? null);
		if (word === null) throw new Error("No save observed yet on __lesefluss_e2e_save");
		return word;
	},

	/**
	 * Wait for the next position save to commit. Reader sets a dev-only window
	 * hook (`__lesefluss_e2e_save`) at the tail of every `savePosition()` call,
	 * after `queries.updateBook(...)` has resolved. Polling this beats wall-
	 * clock sleeps because it observes the actual write rather than guessing.
	 */
	waitForNextSave: async (page: Page) => {
		const baseline = await page.evaluate(() => window.__lesefluss_e2e_save?.count ?? 0);
		await page.waitForFunction(
			(prev) => (window.__lesefluss_e2e_save?.count ?? 0) > prev,
			baseline,
			{ timeout: 10_000 },
		);
	},
};
