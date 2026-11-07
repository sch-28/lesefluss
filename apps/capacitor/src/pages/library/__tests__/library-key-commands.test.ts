import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchCommandKey } from "../../../commands/dispatcher";
import { shortcutGroups } from "../../../commands/shortcut-groups";
import { type LibraryKeyInput, libraryKeyCommands } from "../commands";

function input(overrides: Partial<LibraryKeyInput> = {}): LibraryKeyInput {
	return {
		canSearch: true,
		hasItems: true,
		hasFocusedItem: true,
		hasFocusedBook: true,
		hasTargets: true,
		isBusy: false,
		canGroup: true,
		canEscape: true,
		focusSearch: vi.fn(),
		move: vi.fn(),
		openFocused: vi.fn(),
		toggleFocused: vi.fn(),
		escape: vi.fn(),
		rate: vi.fn(),
		openSheet: vi.fn(),
		openGroupBy: vi.fn(),
		...overrides,
	};
}

function press(
	key: string,
	mods: Partial<KeyboardEventInit> = {},
	target: Element = document.body,
) {
	const e = new KeyboardEvent("keydown", { key, cancelable: true, bubbles: true, ...mods });
	Object.defineProperty(e, "target", { value: target });
	return e;
}

afterEach(() => {
	document.body.innerHTML = "";
});

describe("libraryKeyCommands", () => {
	it("routes each key to its action", () => {
		const keys = input();
		const commands = libraryKeyCommands(keys);
		const run = (key: string, mods?: Partial<KeyboardEventInit>) =>
			dispatchCommandKey(press(key, mods), commands);

		run("/");
		expect(keys.focusSearch).toHaveBeenCalled();
		for (const [key, move] of [
			["j", "next"],
			["ArrowRight", "next"],
			["k", "prev"],
			["ArrowLeft", "prev"],
			["ArrowDown", "down"],
			["ArrowUp", "up"],
		] as const) {
			run(key);
			expect(keys.move).toHaveBeenLastCalledWith(move);
		}
		run("Enter");
		expect(keys.openFocused).toHaveBeenCalled();
		run("x");
		expect(keys.toggleFocused).toHaveBeenCalled();
		run("Escape");
		expect(keys.escape).toHaveBeenCalled();
		run("4");
		expect(keys.rate).toHaveBeenLastCalledWith(8);
		run("0");
		expect(keys.rate).toHaveBeenLastCalledWith(null);
		run("s");
		expect(keys.openSheet).toHaveBeenLastCalledWith("status");
		run("t");
		expect(keys.openSheet).toHaveBeenLastCalledWith("add-tags");
		run("T", { shiftKey: true });
		expect(keys.openSheet).toHaveBeenLastCalledWith("remove-tags");
		run("c");
		expect(keys.openSheet).toHaveBeenLastCalledWith("collection");
		run("g");
		expect(keys.openGroupBy).toHaveBeenCalled();
	});

	it("leaves the edit keys alone with nothing to act on or during a bulk run", () => {
		for (const overrides of [{ hasTargets: false }, { isBusy: true }]) {
			const keys = input(overrides);
			const commands = libraryKeyCommands(keys);
			for (const key of ["1", "0", "s", "t", "c"]) dispatchCommandKey(press(key), commands);
			expect(keys.rate).not.toHaveBeenCalled();
			expect(keys.openSheet).not.toHaveBeenCalled();
		}
	});

	it("needs shown items for any item key", () => {
		const keys = input({ hasItems: false });
		const commands = libraryKeyCommands(keys);
		for (const key of ["j", "ArrowDown", "Enter", "x", "3", "s"]) {
			expect(dispatchCommandKey(press(key), commands)).toBe(false);
		}
	});

	it("opens and toggles only a focused item, and clears only what is there", () => {
		const keys = input({ hasFocusedItem: false, hasFocusedBook: false, canEscape: false });
		const commands = libraryKeyCommands(keys);
		for (const key of ["Enter", "x", "Escape"]) dispatchCommandKey(press(key), commands);
		expect(keys.openFocused).not.toHaveBeenCalled();
		expect(keys.toggleFocused).not.toHaveBeenCalled();
		expect(keys.escape).not.toHaveBeenCalled();
	});

	it("keeps search and group-by off where the header hides them", () => {
		const keys = input({ canSearch: false, canGroup: false });
		const commands = libraryKeyCommands(keys);
		expect(dispatchCommandKey(press("/"), commands)).toBe(false);
		expect(dispatchCommandKey(press("g"), commands)).toBe(false);
	});

	it("lets letter keys run with a card focused, but not arrows or Enter", () => {
		const card = document.createElement("button");
		document.body.append(card);
		const keys = input();
		const commands = libraryKeyCommands(keys);
		expect(dispatchCommandKey(press("j", {}, card), commands)).toBe(true);
		expect(dispatchCommandKey(press("ArrowDown", {}, card), commands)).toBe(false);
		expect(dispatchCommandKey(press("Enter", {}, card), commands)).toBe(false);
	});

	it("is listed whole on the shortcut sheet before anything is focused or picked", () => {
		const commands = libraryKeyCommands(
			input({
				hasFocusedItem: false,
				hasFocusedBook: false,
				hasTargets: false,
				canEscape: false,
			}),
		);
		const [library] = shortcutGroups(commands.filter((c) => c.when?.() ?? true));
		expect(library?.label).toBe("Library");
		expect(library?.rows.map((row) => row.id)).toEqual(commands.map((c) => c.id));
		for (const row of library?.rows ?? []) {
			expect(row.keys).toEqual(commands.find((c) => c.id === row.id)?.keys);
		}
	});
});
