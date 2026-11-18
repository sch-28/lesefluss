import { expect, type Page, test } from "@playwright/test";
import { bigBookFixture } from "./helpers/big-book";
import { openBookFromLibrary, seedFixture } from "./helpers/seed";
import { reader } from "./page-objects/reader";

/**
 * LESE-216: the RSVP word sits halfway between the centre of the paused view (title bar to
 * the band, which rests on the progress bar) and the centre of the playing view, which has
 * no band. The big book has a chapter, so the bar shows its second line and is taller than
 * the overlay allows for.
 */

test.use({ contextOptions: { reducedMotion: "reduce" } });

const TOLERANCE_PX = 4;

function geometry(page: Page) {
	return page.evaluate(() => {
		const rect = (selector: string) => document.querySelector(selector)?.getBoundingClientRect();
		const header = rect("header");
		const word = rect(".rsvp-word-line");
		if (!header || !word) throw new Error("no header or RSVP word");
		const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
		const display = document.querySelector(".rsvp-display");
		const bandSpace = display
			? Number.parseFloat(getComputedStyle(display).getPropertyValue("--rsvp-band-space"))
			: Number.NaN;
		return {
			bandSpace,
			guideCentre: (rect(".rsvp-display .rsvp-focal-line")?.top ?? Number.NaN) + 2.2 * rem,
			titleBottom: header.bottom,
			wordCentre: word.top + word.height / 2,
			bandTop: rect(".rsvp-band")?.top,
			cardBottom: rect(".rsvp-controls")?.bottom,
			barTop: rect(".reader-progress-bar")?.top,
		};
	});
}

/** How far the word sits off its target: a quarter band below the paused centre. */
function offTarget(g: Awaited<ReturnType<typeof geometry>>) {
	const pausedCentre = (g.titleBottom + (g.bandTop ?? Number.NaN)) / 2;
	return Math.abs(g.wordCentre - pausedCentre - g.bandSpace / 4);
}

async function expectPlacedAboveBand(page: Page) {
	const g = await geometry(page);
	if (g.bandTop === undefined || g.cardBottom === undefined || g.barTop === undefined) {
		throw new Error("paused band or progress bar missing");
	}
	expect(offTarget(g)).toBeLessThanOrEqual(TOLERANCE_PX);
	expect(
		Math.abs(g.guideCentre - g.wordCentre),
		"the focal guide frames the word",
	).toBeLessThanOrEqual(TOLERANCE_PX);
	expect(g.cardBottom).toBeLessThanOrEqual(g.barTop);
	expect(g.barTop - g.cardBottom).toBeLessThanOrEqual(16);
	return g;
}

for (const viewport of [
	{ width: 390, height: 844 },
	{ width: 1280, height: 800 },
]) {
	test(`at ${viewport.width}px the word sits above the band, which rests on the progress bar`, async ({
		page,
	}) => {
		await page.setViewportSize(viewport);
		await page.addInitScript(() => {
			window.__lesefluss_e2e_fakeTts = true;
		});
		const title = await seedFixture(page, bigBookFixture(), "big.epub");
		await openBookFromLibrary(page, title);
		await reader.expectLoaded(page);
		await reader.waitOpenSettled(page);
		await reader.toggleRsvp(page);
		const band = page.locator(".rsvp-band");
		await expect(band).toBeVisible();

		await expect
			.poll(async () => offTarget(await geometry(page)))
			.toBeLessThanOrEqual(TOLERANCE_PX);
		const paused = await expectPlacedAboveBand(page);

		const display = page.locator(".rsvp-display");
		const word = page.locator(".rsvp-word-line");
		const pausedWord = await word.textContent();
		await display.click({ position: { x: 20, y: 200 } });
		await expect(band).toBeHidden();
		await expect(word).not.toHaveText(pausedWord ?? "");
		expect((await geometry(page)).wordCentre).toBeCloseTo(paused.wordCentre, 0);
		await display.click({ position: { x: 20, y: 200 } });
		await expect(band).toBeVisible();

		const listen = page
			.locator(".rsvp-controls")
			.getByRole("button", { name: "Listen", exact: true });
		await listen.click();
		await expect(listen).toHaveAttribute("aria-pressed", "true");
		await expect(page.getByRole("button", { name: "Sleep timer" })).toBeVisible();
		await expectPlacedAboveBand(page);

		const fit = await band.getAttribute("data-pills");
		const settings = page.getByRole("button", { name: "RSVP settings" });
		await expect(settings.locator("span")).toBeVisible({ visible: fit === "labels" });
		const box = await settings.boundingBox();
		expect(box?.width).toBeGreaterThanOrEqual(44);
		expect(box?.height).toBeGreaterThanOrEqual(44);
	});
}
