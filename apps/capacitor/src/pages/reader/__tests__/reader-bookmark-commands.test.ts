import { describe, expect, it, vi } from "vitest";
import { dispatchCommandKey } from "../../../commands/dispatcher";
import { type ReaderActionInput, readerActionCommands } from "../commands";

function setup(list: ReaderActionInput["bookmarks"]["list"] = []) {
	const bookmarks = { isOnScreen: false, toggle: vi.fn(), goToNext: vi.fn(), list };
	const input: ReaderActionInput = {
		hasContent: true,
		readerMode: "standard",
		paginationStyle: "scroll",
		canChangeLayout: true,
		setPaginationStyle: vi.fn(),
		openSearch: vi.fn(),
		openAppearance: vi.fn(),
		openAnnotations: vi.fn(),
		stepFontSize: vi.fn(),
		readAloud: null,
		chapters: [],
		goToWord: vi.fn(),
		bookmarks,
		openBookDetails: vi.fn(),
		fullscreen: null,
		openMini: null,
	};
	const commands = readerActionCommands(input);
	const press = (key: string, mods: Partial<KeyboardEventInit> = {}) =>
		dispatchCommandKey(
			new KeyboardEvent("keydown", { key, cancelable: true, ...mods }),
			commands.filter((c) => c.when?.() ?? true),
		);
	return { input, bookmarks, commands, press };
}

const TWO = [
	{ id: "a", word: 10, name: "The river bent" },
	{ id: "b", word: 80, name: "Chapter two" },
];

describe("reader bookmark commands", () => {
	it("B toggles the bookmark on screen", () => {
		const { bookmarks, press } = setup();
		press("b");
		expect(bookmarks.toggle).toHaveBeenCalledOnce();
		expect(bookmarks.goToNext).not.toHaveBeenCalled();
	});

	it("CapsLock alone is B, not Shift+B", () => {
		const { bookmarks, press } = setup(TWO);
		press("B");
		expect(bookmarks.toggle).toHaveBeenCalledOnce();
		expect(bookmarks.goToNext).not.toHaveBeenCalled();
	});

	it("Shift+B goes to the next bookmark, with or without CapsLock", () => {
		const { bookmarks, press } = setup(TWO);
		press("B", { shiftKey: true });
		press("b", { shiftKey: true });
		expect(bookmarks.goToNext).toHaveBeenCalledTimes(2);
		expect(bookmarks.toggle).not.toHaveBeenCalled();
	});

	it("Shift+B does nothing without bookmarks", () => {
		const { bookmarks, press } = setup();
		press("B", { shiftKey: true });
		expect(bookmarks.goToNext).not.toHaveBeenCalled();
		expect(bookmarks.toggle).not.toHaveBeenCalled();
	});

	it("offers each bookmark in palette search, jumping to its word", () => {
		const { input, commands } = setup(TWO);
		const go = commands.filter((c) => c.id.startsWith("reader.bookmark.go."));
		expect(go.map((c) => [c.title, c.isSearchOnly])).toEqual([
			["Go to bookmark: The river bent", true],
			["Go to bookmark: Chapter two", true],
		]);
		go[1].run();
		expect(input.goToWord).toHaveBeenCalledWith(80);
	});
});

describe("reader mini window command", () => {
	it("is in the palette without a key where the mini window can open", () => {
		const { input } = setup();
		const openMini = vi.fn();
		const command = readerActionCommands({ ...input, openMini }).find(
			(c) => c.id === "reader.mini",
		);
		expect(command?.title).toBe("Quick RSVP");
		expect(command?.keys).toBeUndefined();
		command?.run();
		expect(openMini).toHaveBeenCalledOnce();
	});

	it("is absent where it cannot open", () => {
		const { commands } = setup();
		expect(commands.find((c) => c.id === "reader.mini")).toBeUndefined();
	});
});

describe("reader keys for the sheets", () => {
	it("opens search, contents and appearance, and steps the font size", () => {
		const { input, press } = setup();
		press("/");
		press("c");
		press("a");
		press("+", { shiftKey: true });
		press("=");
		press("-");
		expect(input.openSearch).toHaveBeenCalledOnce();
		expect(input.openAnnotations).toHaveBeenCalledOnce();
		expect(input.openAppearance).toHaveBeenCalledOnce();
		expect(vi.mocked(input.stepFontSize).mock.calls).toEqual([[1], [1], [-1]]);
	});

	it("names the bookmark key for what it does, not for its current state", () => {
		const { input } = setup();
		const bookmark = readerActionCommands({
			...input,
			bookmarks: { ...input.bookmarks, isOnScreen: true },
		}).find((c) => c.id === "reader.bookmark");
		expect(bookmark?.title).toBe("Remove bookmark here");
		expect(bookmark?.sheetTitle).toBe("Add or remove bookmark");
	});

	it("names the layout and contents actions as the reader menu does", () => {
		const { input } = setup();
		const titles = (style: ReaderActionInput["paginationStyle"]) =>
			readerActionCommands({ ...input, paginationStyle: style }).map((c) => c.title);
		expect(titles("scroll")).toEqual(
			expect.arrayContaining(["Layout: Page", "Contents and annotations"]),
		);
		expect(titles("page")).toContain("Layout: Scroll");
	});
});
