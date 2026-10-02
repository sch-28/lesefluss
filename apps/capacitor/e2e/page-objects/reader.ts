import { expect, type Locator, type Page } from "@playwright/test";
import { LONG_PRESS_MS } from "../../src/pages/reader/long-press";
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
		return reader.wordPositionIn(reader.wordSpan(page, text));
	},

	/** Position of the word span `span` resolves to. */
	wordPositionIn: async (span: Locator): Promise<number> => {
		const attr = await span.getAttribute("data-word");
		if (!attr) throw new Error("No data-word attr on the given span");
		return Number.parseInt(attr, 10);
	},

	/** Position of the first word span inside `scope` (a paragraph, a figure's sibling). */
	firstWordPositionIn: async (scope: Locator): Promise<number> =>
		reader.wordPositionIn(scope.locator("span[data-word]").first()),

	/**
	 * The word the scroll reader treats as its position: the first span at or
	 * below the scroll container's top edge, the same rule `handleScrollEnd`
	 * applies on settle. Opening a book aligns the saved word here.
	 */
	scrollModeTopWord: async (page: Page): Promise<number> =>
		page.evaluate(() => {
			let container =
				document.querySelector("span[data-word], .reader-figure, .reader-heading")?.parentElement ??
				null;
			while (container && container.scrollHeight <= container.clientHeight) {
				container = container.parentElement;
			}
			const cutoff = container?.getBoundingClientRect().top ?? 0;
			const below = [...document.querySelectorAll<HTMLElement>("span[data-word]")]
				.map((s) => ({ top: s.getBoundingClientRect().top, word: Number(s.dataset.word) }))
				.filter((s) => s.top >= cutoff)
				.sort((a, b) => a.top - b.top);
			return below[0]?.word ?? -1;
		}),

	/** Past the reader's post-open cooldown, during which scroll ends are ignored. */
	OPEN_SETTLE_MS: 1500,

	/** Wait out `JUMP_SETTLE_GUARD_MS` (reader/index.tsx) plus a render-flush margin,
	 *  so any settle racing a jump has definitely tried to fire. */
	waitPastJumpGuard: async (page: Page) => {
		const JUMP_SETTLE_GUARD_MS = 1500;
		await page.waitForTimeout(JUMP_SETTLE_GUARD_MS + 300);
	},

	tocJumpToChapter: async (page: Page, label: string) => {
		await page.getByRole("button", { name: "Annotations" }).click();
		await page.getByRole("button", { name: label }).click();
	},

	wheel: async (page: Page, deltaY: number) => {
		const centre = await page.evaluate(() => {
			let el =
				document.querySelector("span[data-word], .reader-figure, .reader-heading")?.parentElement ??
				null;
			while (el && el.scrollHeight <= el.clientHeight) el = el.parentElement;
			if (!el) throw new Error("No scrollable reader container");
			const r = el.getBoundingClientRect();
			return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
		});
		await page.mouse.move(centre.x, centre.y);
		await page.mouse.wheel(0, deltaY);
	},

	browseBar: (page: Page): Locator => page.getByTestId("browse-bar"),

	browseBack: async (page: Page) => {
		await page.getByTestId("browse-back").click();
	},

	readFromHere: async (page: Page) => {
		await page.getByTestId("browse-read-from-here").click();
	},

	/** A TOC jump only browses; committing it makes the chapter the saved position. */
	moveToChapter: async (page: Page, label: string) => {
		await reader.tocJumpToChapter(page, label);
		await expect(reader.browseBar(page)).toBeVisible();
		await reader.readFromHere(page);
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

	/**
	 * Touch long-press on `startText`, then drag the finger to `endText` and
	 * lift. Real touch events through DevTools, so the reader's long-press
	 * timer, touchmove scroll block and drag-over-figure handling all run.
	 */
	touchLongPressSelect: async (page: Page, startText: string, endText: string) => {
		const start = await centreOf(reader.wordSpan(page, startText));
		const end = await centreOf(reader.wordSpan(page, endText));
		await touchLongPress(page, start, end);
	},

	/** Touch long-press at the centre of `target` without moving, then lift. */
	touchLongPressOn: async (page: Page, target: Locator) => {
		const point = await centreOf(target);
		await touchLongPress(page, point, point);
	},

	/** The floating selection toolbar; absent when nothing is selected. */
	selectionToolbar: (page: Page): Locator => page.getByRole("toolbar"),

	/** Save the live selection, then pick `color` from the swatches that replace the actions. */
	applyHighlight: async (page: Page, color: HighlightColor): Promise<number> => {
		await page.getByRole("button", { name: "Highlight", exact: true }).click();
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
	 * Dismiss the selection toolbar that the apply-highlight flow leaves up. The
	 * toolbar has no close button: a tap on a word outside the selection dismisses
	 * it. Selection state must be cleared before another mouse-drag can route to
	 * `openHighlightEditor` instead of extending the live selection.
	 */
	dismissSelection: async (page: Page) => {
		const toolbar = page.getByRole("toolbar");
		if ((await toolbar.count()) === 0) return;
		await page.locator("span[data-word]:not(.word-selecting)").first().click();
		await expect(toolbar).toHaveCount(0);
	},

	expectNoHighlight: async (page: Page, wordPosition: number) => {
		const span = page.locator(`span[data-word="${wordPosition}"]`);
		// A negated matcher passes on a missing element; require the span first.
		await expect(span).toHaveCount(1, { timeout: 10_000 });
		await expect(span).not.toHaveClass(/word-highlight-/, { timeout: 10_000 });
	},

	/**
	 * Select an existing highlight (the toolbar's swatch/Note/Delete step) by
	 * starting a mouse-drag on the highlighted span. Reader's
	 * `handleWordMouseDragStart` short-circuits to `openHighlightEditor` when the
	 * underlying word is already in a highlight.
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
		await page.getByRole("button", { name: "Delete", exact: true }).click();
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

	/** The note sheet's textarea, opened from the toolbar's Note action. */
	openHighlightNote: async (page: Page): Promise<Locator> => {
		await page.getByRole("button", { name: "Note", exact: true }).click();
		const ta = page.getByPlaceholder("Add a note to this highlight…");
		await expect(ta).toBeVisible();
		return ta;
	},

	setHighlightNoteFromEditor: async (page: Page, note: string) => {
		const ta = await reader.openHighlightNote(page);
		await ta.fill(note);
		// Done saves via a fire-and-forget `updateHighlightMutation.mutate(...)`;
		// the brief wait lets the IDB transaction flush before any subsequent
		// page.goto kills the JS context.
		await page.getByRole("button", { name: "Done" }).click();
		await page.waitForTimeout(150);
	},

	changeHighlightColorFromEditor: async (page: Page, color: HighlightColor) => {
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

	/** Locator for the expanded progress scrubber; the collapsed resting line is always shown. */
	progressBar: (page: Page): Locator =>
		page.locator(".reader-progress-bar:not(.reader-progress-bar--collapsed)"),

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
	/** The window keydown handler ignores events whose target is interactive,
	 *  and the appearance popover restores focus to its trigger button. */
	blurFocusedControl: async (page: Page) => {
		await page.evaluate(() => {
			if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
		});
	},

	/** Pages the current chunk paginates into, from the multicol container's width. */
	pageModePageCount: async (page: Page): Promise<number> =>
		page.evaluate(() => {
			const chunk = document.querySelector<HTMLElement>("[data-chunk-index]");
			return chunk ? Math.ceil(chunk.scrollWidth / chunk.clientWidth) : 0;
		}),

	turnPages: async (page: Page, count: number) => {
		await reader.blurFocusedControl(page);
		for (let i = 0; i < count; i++) {
			const savePending = reader.waitForNextSave(page);
			await page.keyboard.press("ArrowRight");
			await savePending;
		}
	},
};

type Point = { x: number; y: number };

async function centreOf(target: Locator): Promise<Point> {
	const box = await target.boundingBox();
	if (!box) throw new Error("Target has no bounding box");
	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Margin past the reader's long-press timer before the finger starts moving. */
const LONG_PRESS_MARGIN_MS = 150;
const TOUCH_DRAG_STEPS = 6;
const TOUCH_DRAG_STEP_MS = 40;

async function touchLongPress(page: Page, from: Point, to: Point): Promise<void> {
	const cdp = await page.context().newCDPSession(page);
	try {
		await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true });
		await cdp.send("Input.dispatchTouchEvent", {
			type: "touchStart",
			touchPoints: [{ x: from.x, y: from.y }],
		});
		await page.waitForTimeout(LONG_PRESS_MS + LONG_PRESS_MARGIN_MS);
		for (let i = 1; i <= TOUCH_DRAG_STEPS; i++) {
			const t = i / TOUCH_DRAG_STEPS;
			await cdp.send("Input.dispatchTouchEvent", {
				type: "touchMove",
				touchPoints: [{ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }],
			});
			await page.waitForTimeout(TOUCH_DRAG_STEP_MS);
		}
		await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
	} finally {
		await cdp.detach().catch(() => {});
	}
}
