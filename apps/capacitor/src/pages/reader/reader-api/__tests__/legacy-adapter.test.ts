import { describe, expect, it, vi } from "vitest";
import { createLegacyReaderApi, createNavigateEmitter } from "../legacy-adapter";
import type { ReaderMode } from "../types";

function span(word: number, top: number, left = 10): HTMLElement {
	const el = document.createElement("span");
	el.dataset.word = String(word);
	el.getClientRects = () => [new DOMRect(left, top, 40, 20)] as unknown as DOMRectList;
	return el;
}

function viewWith(height: number, ...spans: HTMLElement[]): HTMLElement {
	const view = document.createElement("div");
	view.getBoundingClientRect = () => new DOMRect(0, 0, 400, height);
	view.append(...spans);
	return view;
}

function apiFor(mode: ReaderMode, view: Element | null, currentWord: number | null = null) {
	const emitter = createNavigateEmitter();
	const navigateToWord = vi.fn();
	const api = createLegacyReaderApi({
		mode,
		emitter,
		getView: () => view,
		getCurrentWord: () => currentWord,
		navigateToWord,
	});
	return { api, emitter, navigateToWord };
}

describe("legacy reader api", () => {
	it("reports the first and last word on screen in scroll mode", () => {
		const view = viewWith(100, span(3, -30), span(4, 0), span(5, 50), span(6, 90), span(7, 130));

		expect(apiFor("scroll", view).api.visibleWords()).toEqual({ first: 4, last: 6 });
	});

	it("counts a word split across the top edge by its tail and a heading by its first word", () => {
		const split = document.createElement("span");
		split.dataset.word = "8";
		split.getClientRects = () =>
			[new DOMRect(300, -20, 40, 20), new DOMRect(0, 0, 20, 20)] as unknown as DOMRectList;
		const heading = document.createElement("h2");
		heading.dataset.headingWord = "9";
		heading.getClientRects = () => [new DOMRect(0, 30, 200, 30)] as unknown as DOMRectList;
		const view = viewWith(100, span(7, -30), split, heading, span(12, 70));

		expect(apiFor("scroll", view).api.visibleWords()).toEqual({ first: 8, last: 12 });
	});

	it("counts only page mode's clip, not the neighbouring pages in the gutters", () => {
		const view = viewWith(800);
		const clip = document.createElement("div");
		clip.className = "page-clip";
		clip.getBoundingClientRect = () => new DOMRect(200, 0, 400, 800);
		clip.append(span(100, 10, 150), span(500, 10, 240), span(520, 400, 500), span(900, 10, 650));
		view.append(clip);

		expect(apiFor("page", view).api.visibleWords()).toEqual({ first: 500, last: 520 });
	});

	it("reports the shown word in RSVP and null before any view has laid out", () => {
		expect(apiFor("rsvp", null, 42).api.visibleWords()).toEqual({ first: 42, last: 42 });
		expect(apiFor("scroll", null).api.visibleWords()).toBeNull();
		expect(apiFor("scroll", viewWith(100)).api.visibleWords()).toBeNull();
	});

	it("gives every line fragment of the words in a range", () => {
		const split = document.createElement("span");
		split.dataset.word = "11";
		const head = new DOMRect(300, 0, 40, 20);
		const tail = new DOMRect(0, 20, 20, 20);
		split.getClientRects = () => [head, tail] as unknown as DOMRectList;
		const view = viewWith(100, span(10, 0), split, span(12, 40));

		expect(apiFor("scroll", view).api.rectsFor({ start: 11, end: 12 })).toEqual([
			head,
			tail,
			new DOMRect(10, 40, 40, 20),
		]);
		expect(apiFor("rsvp", view).api.rectsFor({ start: 0, end: 20 })).toEqual([]);
	});

	it("delegates goToWord and reads the current word", () => {
		const { api, navigateToWord } = apiFor("scroll", null, 77);
		api.goToWord(5);

		expect(navigateToWord).toHaveBeenCalledWith(5);
		expect(api.currentWord()).toBe(77);
		expect(apiFor("scroll", null, null).api.currentWord()).toBe(0);
	});

	it("notifies user-intent saves only, until unsubscribed", () => {
		const { api, emitter } = apiFor("scroll", null);
		const seen: [number, string][] = [];
		const off = api.onUserNavigate((word, source) => seen.push([word, source]));

		for (const source of [
			"settle",
			"jump",
			"word-tap",
			"scrub",
			"browse",
			"rsvp",
			"rsvp-exit",
			"read-aloud",
		] as const) {
			emitter.emit(1, source);
		}
		for (const source of ["recovered", "kept-local", "adopted", "unmount", "pagehide"] as const) {
			emitter.emit(2, source);
		}
		off();
		emitter.emit(3, "settle");

		expect(seen.map(([, s]) => s)).toEqual([
			"settle",
			"jump",
			"word-tap",
			"scrub",
			"browse",
			"rsvp",
			"rsvp-exit",
			"read-aloud",
		]);
		expect(seen.every(([w]) => w === 1)).toBe(true);
	});

	it("keeps the save path going when a listener throws", () => {
		const { api, emitter } = apiFor("scroll", null);
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const after = vi.fn();
		api.onUserNavigate(() => {
			throw new Error("boom");
		});
		api.onUserNavigate(after);

		expect(() => emitter.emit(9, "settle")).not.toThrow();
		expect(after).toHaveBeenCalledWith(9, "settle");
		error.mockRestore();
	});
});
