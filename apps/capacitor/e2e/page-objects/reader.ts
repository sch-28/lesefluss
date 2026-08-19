import { expect, type Locator, type Page } from "@playwright/test";
import { pendingPositionKey } from "../../src/pages/reader/pending-position";

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
 * A stepper row in the appearance popover, scoped by its label. The rows share
 * button glyphs ("+" appears under both Spacing and Margins), so the label is
 * what disambiguates them.
 */
function stepperRow(page: Page, label: string): Locator {
	return page.locator(".ap-row").filter({ hasText: label });
}

/**
 * Dismiss the appearance popover and wait for it to leave the DOM. The popover
 * restores focus to its trigger button as it unmounts, and the reader's window
 * keydown handler ignores events whose target is interactive — so a keyboard
 * action taken before this settles would be swallowed by the trigger.
 */
async function closeAppearancePopover(page: Page): Promise<void> {
	await page.keyboard.press("Escape");
	await expect(page.locator(".appearance-popover-content")).toHaveCount(0);
}

/**
 * Click a stepper's increase button and wait for the displayed value to change
 * before dismissing the popover. `useSaveSettings` writes SQLite and only then
 * invalidates the query, with no optimistic update, so a second click issued
 * before the round-trip completes recomputes from the stale value and silently
 * does nothing.
 */
async function stepUpAppearance(page: Page, label: string, glyph: string): Promise<void> {
	await page.getByRole("button", { name: "Appearance settings" }).click();
	const row = stepperRow(page, label);
	const value = row.locator(".ap-row-value");
	const before = await value.textContent();
	await row.getByRole("button", { name: glyph, exact: true }).click();
	await expect(value).not.toHaveText(before ?? "");
	await closeAppearancePopover(page);
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
		const cls =
			(await page.locator(`span[data-word="${wordPosition}"]`).getAttribute("class")) ?? "";
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
		await page
			.getByRole("heading", { name: "Glossary entry" })
			.waitFor({ state: "visible", timeout: 5000 });
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
		await closeAppearancePopover(page);
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

	/** Monotonic count of position saves observed so far (0 before any save). */
	saveCount: async (page: Page): Promise<number> =>
		page.evaluate(() => window.__lesefluss_e2e_save?.count ?? 0),

	/**
	 * Wait for a save to land beyond `prevCount` within `timeoutMs`. Unlike
	 * `waitForNextSave`, the caller supplies the baseline and a tight timeout so
	 * a test can assert that a save fired in a bounded window (e.g. distinguishing
	 * a teardown flush from the next throttled autosave).
	 */
	waitForSaveAbove: async (page: Page, prevCount: number, timeoutMs: number) => {
		await page.waitForFunction(
			(prev) => (window.__lesefluss_e2e_save?.count ?? 0) > prev,
			prevCount,
			{ timeout: timeoutMs },
		);
	},

	// ── Durable-resume fallback (localStorage) ───────────────────────────
	// Drives src/pages/reader/pending-position.ts so a test can simulate an
	// orphaned (uncommitted) save and assert the mount reconcile.

	/** The current book id, parsed from the `/tabs/reader/<id>` route. */
	bookIdFromUrl: (page: Page): string => {
		const match = /\/tabs\/reader\/([^/?#]+)/.exec(page.url());
		if (!match) throw new Error(`Not on a reader route: ${page.url()}`);
		return decodeURIComponent(match[1]);
	},

	/**
	 * Plant a pending-position entry as if a teardown had left an uncommitted
	 * save. `atOffsetMs` is added to the browser's `Date.now()` so a positive
	 * value is newer than the row's lastRead (should recover) and a negative one
	 * is older (should be ignored).
	 */
	setPendingPosition: async (page: Page, bookId: string, word: number, atOffsetMs: number) => {
		await page.evaluate(
			({ key, word, atOffsetMs }) =>
				localStorage.setItem(key, JSON.stringify({ word, at: Date.now() + atOffsetMs })),
			{ key: pendingPositionKey(bookId), word, atOffsetMs },
		);
	},

	getPendingPosition: async (
		page: Page,
		bookId: string,
	): Promise<{ word: number; at: number } | null> =>
		page.evaluate((key) => {
			const raw = localStorage.getItem(key);
			return raw ? (JSON.parse(raw) as { word: number; at: number }) : null;
		}, pendingPositionKey(bookId)),

	// ── External hyperlinks ──────────────────────────────────────────────
	// `Browser.open` does not navigate in the Playwright web build, so taps are
	// asserted via the dev-only `__lesefluss_e2e_link_open` hook the reader
	// publishes (mirrors `__lesefluss_e2e_save`).

	/** The href of the most recently opened link. Throws if none opened yet. */
	lastLinkOpened: async (page: Page): Promise<string> => {
		const href = await page.evaluate(() => window.__lesefluss_e2e_link_open?.href ?? null);
		if (href === null) throw new Error("No link open observed yet");
		return href;
	},

	/** Wait for a link open (optionally matching `expectedHref`). */
	waitForLinkOpen: async (page: Page, expectedHref?: string) => {
		await page.waitForFunction(
			(expected) => {
				const hook = window.__lesefluss_e2e_link_open;
				return !!hook && (!expected || hook.href === expected);
			},
			expectedHref,
			{ timeout: 5000 },
		);
	},

	// ── Page mode (paginated view) ───────────────────────────────────────
	// Page mode keeps every word of the chunk mounted and shifts the visible
	// page with a translateX on a wrapper, so DOM order reveals nothing about
	// what the user can actually see. These helpers read geometry instead:
	// `.page-view`'s content box (its border box inset by its own horizontal
	// padding) is exactly the clip area one page occupies, so a word is on the
	// visible page iff the centre of its first client rect falls inside it.

	/**
	 * Word positions currently visible on the page, ordered top-left first —
	 * the same ordering `page-view/measurements.ts` uses to pick the saved
	 * position on settle.
	 */
	pageModeVisibleWords: async (page: Page): Promise<number[]> =>
		page.evaluate(() => {
			const view = document.querySelector<HTMLElement>(".page-view");
			if (!view) return [];
			const box = view.getBoundingClientRect();
			const style = window.getComputedStyle(view);
			const left = box.left + Number.parseFloat(style.paddingLeft);
			const right = box.right - Number.parseFloat(style.paddingRight);
			const found: { word: number; top: number; left: number }[] = [];
			for (const span of view.querySelectorAll<HTMLElement>("span[data-word]")) {
				const rects = span.getClientRects();
				const r = rects.length > 0 ? rects[0] : span.getBoundingClientRect();
				const x = r.left + r.width / 2;
				const y = r.top + r.height / 2;
				if (x < left || x > right || y < box.top || y > box.bottom) continue;
				const word = Number.parseInt(span.dataset.word ?? "", 10);
				if (Number.isNaN(word) || word < 0) continue;
				found.push({ word, top: r.top, left: r.left });
			}
			found.sort((a, b) => a.top - b.top || a.left - b.left);
			return found.map((f) => f.word);
		}),

	/** The topmost-leftmost visible word position. Throws if the page is empty. */
	pageModeFirstVisibleWord: async (page: Page): Promise<number> => {
		const words = await reader.pageModeVisibleWords(page);
		const first = words[0];
		if (first === undefined) throw new Error("No visible word spans in page mode");
		return first;
	},

	/**
	 * Assert `word` is on the visible page, polling so an in-flight
	 * repagination (viewport resize, appearance change) settles first. Polling
	 * beats a fixed sleep here: nothing observable fires when the view
	 * re-anchors, so there is no event to wait on.
	 */
	expectWordVisibleInPage: async (page: Page, word: number, timeoutMs = 5000) => {
		await expect
			.poll(() => reader.pageModeVisibleWords(page), { timeout: timeoutMs })
			.toContain(word);
	},

	/**
	 * Tap the centre zone of the page. `routeTap` splits the column into
	 * thirds by `clientX - rect.left - margin`, so the element centre always
	 * lands in the middle third (the zone that does not turn a page). A mouse
	 * click emits pointer events but no touch events, so the two-finger pause
	 * detector stays disarmed.
	 */
	tapPageCentre: async (page: Page) => {
		await page.locator(".page-view").click();
	},

	/** Locator for the reading-progress scrubber. */
	progressBar: (page: Page): Locator => page.locator(".reader-progress-bar"),

	// ── Appearance popover steppers ──────────────────────────────────────

	/** Bump the reader font size one step up, via the appearance popover. */
	increaseFontSize: async (page: Page) => {
		await stepUpAppearance(page, "Size", "A+");
	},

	/** Bump the reader line spacing one step up, via the appearance popover. */
	increaseLineSpacing: async (page: Page) => {
		await stepUpAppearance(page, "Spacing", "+");
	},

	/**
	 * Turn `count` pages forward with the keyboard, waiting for each turn's
	 * position save so the next keypress isn't swallowed by the in-flight page
	 * transition.
	 */
	turnPages: async (page: Page, count: number) => {
		// The window keydown handler ignores events whose target is interactive,
		// and the appearance popover restores focus to its trigger button.
		await page.evaluate(() => {
			if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
		});
		for (let i = 0; i < count; i++) {
			const savePending = reader.waitForNextSave(page);
			await page.keyboard.press("ArrowRight");
			await savePending;
		}
	},
};
