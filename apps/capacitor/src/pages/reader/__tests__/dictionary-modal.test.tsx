import type { DictionaryLookupResponse } from "@lesefluss/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { flush, type Rendered, render } from "../../../test/render";

const lookupWord = vi.fn<() => Promise<DictionaryLookupResponse>>();
vi.mock("../../../services/dictionary/client", () => ({ lookupWord: () => lookupWord() }));

const { default: DictionaryModal } = await import("../dictionary-modal");

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	lookupWord.mockReset();
});

const response = (over: Partial<DictionaryLookupResponse>): DictionaryLookupResponse => ({
	query: "paragraphs",
	requested: "en",
	chain: ["en"],
	entry: null,
	lemma: null,
	attribution: { source: "Wiktionary", license: "CC BY-SA 4.0", url: "https://example.org" },
	...over,
});

/** The drawer portals out of the render container, so read the whole document. */
const drawerText = () => (document.body.textContent ?? "").replace(/\s+/g, " ");

async function open(word: string) {
	view = await render(<DictionaryModal word={word} lang="en" onClose={() => {}} />);
	await flush();
	await flush();
}

describe("DictionaryModal", () => {
	it("shows the lemma line above the definition for an inflected form", async () => {
		lookupWord.mockResolvedValue(
			response({
				lemma: { from: "paragraphs", note: "plural of paragraph" },
				entry: {
					word: "paragraph",
					lang: "en",
					senses: [{ partOfSpeech: "noun", gloss: "A passage of text.", example: null }],
				},
			}),
		);
		await open("paragraphs");
		const text = drawerText();
		expect(text).toContain("paragraphs → paragraph");
		expect(text).toContain("plural of paragraph");
		expect(text.indexOf("plural of paragraph")).toBeLessThan(text.indexOf("A passage of text."));
	});

	it("shows the not-found message, not the error state, for a word no dictionary has", async () => {
		lookupWord.mockResolvedValue(response({ entry: null }));
		await open("Chapter");
		expect(drawerText()).toContain("No definition found for “Chapter”.");
		expect(drawerText()).not.toContain("Could not load definition");
	});

	it("shows the error state, not the not-found message, when the lookup fails", async () => {
		lookupWord.mockRejectedValue(new Error("network"));
		await open("Chapter");
		expect(drawerText()).toContain("Could not load definition");
		expect(drawerText()).not.toContain("No definition found");
	});
});
