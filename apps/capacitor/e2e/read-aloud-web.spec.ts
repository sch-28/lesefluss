import { expect, type Page, test } from "@playwright/test";
import { bigBookFixture } from "./helpers/big-book";
import { openBookFromLibrary, seedFixture } from "./helpers/seed";
import { reader } from "./page-objects/reader";

/**
 * Read aloud in the web build, on the Web Speech engine over a fake
 * `speechSynthesis` that speaks only when the test says so: it starts at the
 * reader's word, the view follows the voice, the pause saves the spoken word
 * and the sitting reaches stats, and L and V work as the Listen and Back to
 * voice buttons do.
 */

declare global {
	interface Window {
		__e2e_speech?: { utterances: () => number; text: () => string; speak: (words: number) => void };
	}
}

async function installFakeSpeech(page: Page) {
	await page.addInitScript(() => {
		type Utterance = {
			text: string;
			onstart: ((e: unknown) => void) | null;
			onboundary: ((e: { name: string; charIndex: number }) => void) | null;
			onend: ((e: unknown) => void) | null;
			onerror: ((e: { error: string }) => void) | null;
			words?: RegExpMatchArray[];
			next?: number;
		};
		const voice = {
			voiceURI: "e2e",
			name: "E2E voice",
			lang: "en-US",
			localService: true,
			default: true,
		};
		const queue: Utterance[] = [];
		let current: Utterance | null = null;
		let spoken = 0;
		const startNext = () => {
			current = queue.shift() ?? null;
			if (!current) return;
			spoken++;
			current.words = [...current.text.matchAll(/\S+/g)];
			current.next = 0;
			current.onstart?.({});
		};
		const synth = {
			speaking: false,
			pending: false,
			paused: false,
			getVoices: () => [voice],
			addEventListener: () => {},
			removeEventListener: () => {},
			speak: (u: Utterance) => {
				queue.push(u);
				if (!current) startNext();
			},
			cancel: () => {
				const dropped = [current, ...queue].filter((u): u is Utterance => u != null);
				queue.length = 0;
				current = null;
				for (const u of dropped) u.onerror?.({ error: "canceled" });
			},
			pause: () => {},
			resume: () => {},
		};
		class FakeUtterance {
			text: string;
			rate = 1;
			pitch = 1;
			lang = "";
			voice: unknown = null;
			onstart = null;
			onboundary = null;
			onend = null;
			onerror = null;
			constructor(text: string) {
				this.text = text;
			}
		}
		Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
		Object.defineProperty(window, "SpeechSynthesisUtterance", {
			value: FakeUtterance,
			configurable: true,
		});
		window.__e2e_speech = {
			utterances: () => spoken,
			text: () => current?.text ?? "",
			speak: (words) => {
				for (let i = 0; i < words && current; i++) {
					const u: Utterance = current;
					const word = u.words?.[u.next ?? 0];
					if (word) {
						u.next = (u.next ?? 0) + 1;
						u.onboundary?.({ name: "word", charIndex: word.index ?? 0 });
					} else {
						i--;
						current = null;
						u.onend?.({});
						if (!current) startNext();
					}
				}
			},
		};
	});
}

const utterances = (page: Page) => page.evaluate(() => window.__e2e_speech?.utterances() ?? 0);
const speak = (page: Page, words: number) =>
	page.evaluate((words) => window.__e2e_speech?.speak(words), words);

const lastReadAloudSave = (page: Page) =>
	page.evaluate(
		() => window.__lesefluss_e2e_saveLog?.findLast((s) => s.source === "read-aloud")?.word ?? null,
	);

async function pressKey(page: Page, key: string) {
	await reader.blurFocusedControl(page);
	await page.keyboard.press(key);
}

async function openAtReadWord(page: Page) {
	await installFakeSpeech(page);
	const title = await seedFixture(page, bigBookFixture(), "big.epub");
	await openBookFromLibrary(page, title);
	await reader.expectLoaded(page);
	await reader.waitOpenSettled(page);
	const saved = reader.waitForNextSave(page);
	await reader.wheel(page, 2400);
	await saved;
	await reader.waitPositionQuiet(page);
	return reader.lastSavedWord(page);
}

test("L reads from the reader's word, the view follows, and L pauses at the spoken word, saved and counted", async ({
	page,
}) => {
	const read = await openAtReadWord(page);
	const bookId = reader.bookIdFromUrl(page);
	const startedAt = Date.now();

	await pressKey(page, "l");
	await expect.poll(() => utterances(page)).toBe(1);
	await expect(page.getByRole("button", { name: "Pause listening" }).first()).toBeVisible();
	const firstSpoken = (await page.evaluate(() => window.__e2e_speech?.text() ?? "")).split(
		/\s+/,
	)[0];
	const readWord = await page.locator(`span[data-word="${read}"]`).first().textContent();
	expect(firstSpoken, "the voice starts at the reader's word").toBe(readWord?.trim());

	const top = await reader.scrollModeTopWord(page);
	// In steps, so the engine is handed the next segments as it runs low.
	for (let i = 0; i < 30; i++) {
		await speak(page, 20);
		await page.waitForTimeout(30);
	}
	await expect
		.poll(() => reader.scrollModeTopWord(page), "the view follows the voice")
		.toBeGreaterThan(top + 200);

	// A listen sitting reaches stats only after five seconds.
	await page.waitForTimeout(Math.max(0, 5500 - (Date.now() - startedAt)));
	await speak(page, 3);
	const saves = await page.evaluate(() => window.__lesefluss_e2e_saveLog?.length ?? 0);
	await pressKey(page, "l");
	await expect(page.getByRole("button", { name: "Resume listening" }).first()).toBeVisible();
	await expect
		.poll(() => page.evaluate(() => window.__lesefluss_e2e_saveLog?.length ?? 0))
		.toBeGreaterThan(saves);
	await reader.waitPositionQuiet(page);

	const spoken = await lastReadAloudSave(page);
	expect(spoken).toBeGreaterThan(read + 500);
	expect((await reader.savedRow(page, bookId))?.wordPosition).toBe(spoken);
	await expect
		.poll(
			async () =>
				(
					await page.evaluate((id) => window.__lesefluss_e2e_readBookSessions?.(id), bookId)
				)?.filter((s) => s.mode === "listen").length,
		)
		.toBe(1);

	await pressKey(page, "l");
	await expect(page.getByRole("button", { name: "Pause listening" }).first()).toBeVisible();
	await pressKey(page, "l");
	await expect(page.getByRole("button", { name: "Resume listening" }).first()).toBeVisible();
});

test("V brings the view back to the spoken word after scrolling away, as Back to voice does", async ({
	page,
}) => {
	await openAtReadWord(page);
	await pressKey(page, "l");
	await expect.poll(() => utterances(page)).toBe(1);
	await speak(page, 20);
	await reader.waitPositionQuiet(page);

	// A relayout while listening is no move of the user's: it saves nothing.
	const size = page.viewportSize() ?? { width: 1280, height: 720 };
	await reader.expectNoSaveDuring(page, async () => {
		await page.setViewportSize({ width: 900, height: size.height });
		await page.waitForTimeout(300);
		await page.setViewportSize(size);
	});
	const following = await reader.scrollModeTopWord(page);

	await reader.wheel(page, 3000);
	const backToVoice = page.getByRole("button", { name: "Back to voice" });
	await expect(backToVoice).toBeVisible();
	await expect.poll(() => reader.scrollModeTopWord(page)).toBeGreaterThan(following + 100);

	await pressKey(page, "v");
	await expect(backToVoice).toHaveCount(0);
	await expect
		.poll(async () => Math.abs((await reader.scrollModeTopWord(page)) - following))
		.toBeLessThan(100);
});
