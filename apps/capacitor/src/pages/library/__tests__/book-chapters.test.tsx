import type { WordPosition } from "@lesefluss/core";
import { afterEach, describe, expect, it } from "vitest";
import { type Rendered, render } from "../../../test/render";
import { BookChapters } from "../book-chapters";

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

const at = (n: number) => n as WordPosition;
const mount = async (titles: string[], position: number) => {
	const chapters = titles.map((title, i) => ({ title, startWord: i * 100 }));
	view = await render(
		<BookChapters
			chapters={chapters}
			wordCount={titles.length * 100}
			wordPosition={at(position)}
			onJump={() => {}}
			isResolved
		/>,
	);
	return [...view.container.querySelectorAll("li button")].map((b) => b.textContent);
};

describe("BookChapters", () => {
	it("marks no chapter Here on a book not opened yet", async () => {
		const rows = await mount(["Prologue", "Arrival", "Home"], 0);
		expect(rows.some((r) => r?.includes("Here"))).toBe(false);
	});

	it("marks the chapter being read once the book is started", async () => {
		const rows = await mount(["Prologue", "Arrival", "Home"], 150);
		expect(rows[1]).toContain("Here");
	});

	it("numbers the rows only when the titles carry no number of their own", async () => {
		expect(await mount(["Prologue", "Arrival"], 0)).toEqual(["1Prologue", "2Arrival"]);
		view?.unmount();
		expect(await mount(["Chapter 1", "Chapter 2"], 0)).toEqual(["Chapter 1", "Chapter 2"]);
		view?.unmount();
		expect(await mount(["CHAPTER I.", "CHAPTER II."], 0)).toEqual(["CHAPTER I.", "CHAPTER II."]);
		view?.unmount();
		expect(await mount(["Part One", "Part Two"], 0)).toEqual(["Part One", "Part Two"]);
		view?.unmount();
		expect(await mount(["Chapterhouse", "Partings"], 0)).toEqual(["1Chapterhouse", "2Partings"]);
	});
});
