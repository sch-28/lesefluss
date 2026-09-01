import type { DictionaryLookupResponse } from "@lesefluss/core";
import { expect, type Page, test } from "@playwright/test";
import { openBookFromLibrary, seedStrayAnchorBook } from "./helpers/seed";
import { reader } from "./page-objects/reader";

/**
 * Matched on the path alone: the client resolves `/dictionary` against
 * `VITE_CATALOG_URL`, so pinning the origin would make the mock miss whenever
 * the suite runs against a local catalog. A predicate rather than a glob keeps
 * the query string out of the pattern.
 */
const isDictionaryRequest = (url: URL) => url.pathname === "/dictionary";

const ATTRIBUTION = {
	source: "Wiktionary",
	license: "CC BY-SA 4.0",
	url: "https://creativecommons.org/licenses/by-sa/4.0/",
};

function lookupResponse(over: Partial<DictionaryLookupResponse>): DictionaryLookupResponse {
	return {
		query: "chapter",
		requested: "en",
		chain: ["en", "de"],
		entry: null,
		lemma: null,
		attribution: ATTRIBUTION,
		...over,
	};
}

/**
 * Mock `GET /dictionary` and record every URL it was asked for, so a test can
 * assert on what the client actually sent.
 */
async function mockDictionary(
	page: Page,
	respond: (url: URL) => { status: number; body?: DictionaryLookupResponse } | "abort",
) {
	const requested: URL[] = [];
	await page.route(isDictionaryRequest, async (route, request) => {
		const url = new URL(request.url());
		requested.push(url);
		const result = respond(url);
		if (result === "abort") {
			await route.abort("failed");
			return;
		}
		await route.fulfill({
			status: result.status,
			contentType: "application/json",
			body: JSON.stringify(result.body ?? null),
		});
	});
	return {
		requested,
		cleanup: () => page.unroute(isDictionaryRequest),
	};
}

/**
 * Word tap is two-stage: the first tap makes the word active and saves the
 * position, the second opens the dictionary. `dispatchEvent` mirrors the
 * reader page object's glossary helper — it bypasses the long-press
 * preventDefault dance and still reaches React's delegated onClick.
 */
async function lookUpWord(page: Page, text: string) {
	const span = reader.wordSpan(page, text);
	await span.dispatchEvent("click");
	await expect(span).toHaveClass(/word-active/);
	await span.dispatchEvent("click");
}

const drawer = (page: Page) => page.getByRole("dialog");

test("renders a definition and requests the word with its original casing", async ({ page }) => {
	const title = await seedStrayAnchorBook(page);
	await openBookFromLibrary(page, title);

	const mock = await mockDictionary(page, () => ({
		status: 200,
		body: lookupResponse({
			entry: {
				word: "chapter",
				lang: "en",
				senses: [
					{ partOfSpeech: "noun", gloss: "One of the main sections of a book.", example: null },
					{
						partOfSpeech: "verb",
						gloss: "To divide into chapters.",
						example: "chaptered the text",
					},
				],
			},
		}),
	}));

	try {
		await lookUpWord(page, "Chapter");

		await expect(drawer(page).getByText("One of the main sections of a book.")).toBeVisible({
			timeout: 5000,
		});
		// Grouped by part of speech, one heading per group.
		await expect(drawer(page).getByText("noun", { exact: true })).toBeVisible();
		await expect(drawer(page).getByText("verb", { exact: true })).toBeVisible();
		// CC BY-SA requires the attribution wherever the content is shown.
		await expect(
			drawer(page).getByText(`${ATTRIBUTION.source} · ${ATTRIBUTION.license}`),
		).toBeVisible();

		// The server owns normalisation, so the client must send the surface form
		// untouched — casing is what separates German "Bäume" from "bäume" — plus
		// the book's own language.
		expect(mock.requested).toHaveLength(1);
		expect(mock.requested[0]?.searchParams.get("w")).toBe("Chapter");
		expect(mock.requested[0]?.searchParams.get("lang")).toBe("en");
	} finally {
		await mock.cleanup();
	}
});

test("an inflected form renders the lemma line above the definition", async ({ page }) => {
	const title = await seedStrayAnchorBook(page);
	await openBookFromLibrary(page, title);

	const mock = await mockDictionary(page, () => ({
		status: 200,
		body: lookupResponse({
			query: "paragraphs",
			lemma: { from: "paragraphs", note: "plural of paragraph" },
			entry: {
				word: "paragraph",
				lang: "en",
				senses: [{ partOfSpeech: "noun", gloss: "A passage of text.", example: null }],
			},
		}),
	}));

	try {
		await lookUpWord(page, "paragraph");

		const lemmaLine = drawer(page).locator("p", { hasText: "paragraphs" }).first();
		await expect(lemmaLine).toBeVisible({ timeout: 5000 });
		await expect(lemmaLine).toContainText("paragraph");
		await expect(drawer(page).getByText("plural of paragraph")).toBeVisible();
		await expect(drawer(page).getByText("A passage of text.")).toBeVisible();
	} finally {
		await mock.cleanup();
	}
});

test("an unknown word shows the not-found message, not the error state", async ({ page }) => {
	const title = await seedStrayAnchorBook(page);
	await openBookFromLibrary(page, title);

	// entry: null is a successful lookup of a word no dictionary has.
	const mock = await mockDictionary(page, () => ({
		status: 200,
		body: lookupResponse({ entry: null }),
	}));

	try {
		await lookUpWord(page, "Chapter");

		await expect(drawer(page).getByText(/No definition found for/)).toBeVisible({ timeout: 5000 });
		await expect(drawer(page).getByText(/Could not load definition/)).toHaveCount(0);
	} finally {
		await mock.cleanup();
	}
});

test("a network failure shows the error state", async ({ page }) => {
	const title = await seedStrayAnchorBook(page);
	await openBookFromLibrary(page, title);

	const mock = await mockDictionary(page, () => "abort");

	try {
		await lookUpWord(page, "Chapter");

		await expect(drawer(page).getByText(/Could not load definition/)).toBeVisible({
			timeout: 15_000,
		});
		await expect(drawer(page).getByText(/No definition found for/)).toHaveCount(0);
	} finally {
		await mock.cleanup();
	}
});
