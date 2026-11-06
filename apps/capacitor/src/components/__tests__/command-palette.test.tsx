import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCommandDispatcher } from "../../commands/dispatcher";
import { paletteOpen } from "../../commands/global";
import { type Command, useRegisterCommands } from "../../commands/registry";
import { type Rendered, render } from "../../test/render";
import CommandPalette from "../command-palette";

const runImport = vi.fn();
const runChapter = vi.fn();

const COMMANDS: Command[] = [
	{
		id: "global.palette",
		title: "Command palette",
		scope: "global",
		keys: ["Mod+K"],
		inControls: true,
		claimsKeys: true,
		isHiddenInPalette: true,
		run: () => paletteOpen.set(true),
	},
	{ id: "global.import", title: "Import a book", scope: "global", keys: ["Mod+O"], run: runImport },
	{ id: "reader.rsvp", title: "Read with RSVP", scope: "reader", keys: ["r"], run: vi.fn() },
	{
		id: "reader.chapter.0",
		title: "Go to: The Long Night",
		scope: "reader",
		isSearchOnly: true,
		run: runChapter,
	},
];

function App() {
	useCommandDispatcher();
	useRegisterCommands(COMMANDS);
	return <CommandPalette />;
}

let view: Rendered | null = null;
afterEach(() => {
	view?.unmount();
	view = null;
	act(() => paletteOpen.set(false));
	vi.clearAllMocks();
});

const palette = () => document.querySelector<HTMLElement>("[data-testid=command-palette]");
const input = () => palette()?.querySelector("input") as HTMLInputElement;
const options = () =>
	[...(palette()?.querySelectorAll("[role=option]") ?? [])].map((o) => o.textContent);

async function type(text: string) {
	await act(async () => {
		const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
		setter?.call(input(), text);
		input().dispatchEvent(new Event("input", { bubbles: true }));
	});
}

async function key(target: EventTarget, k: string, mods: Partial<KeyboardEventInit> = {}) {
	await act(async () => {
		target.dispatchEvent(
			new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...mods }),
		);
	});
}

describe("CommandPalette", () => {
	it("opens on Ctrl+K, groups rows by scope and shows each shortcut", async () => {
		view = await render(<App />);
		await key(window, "k", { ctrlKey: true });
		expect(palette()).not.toBeNull();
		const groups = [...(palette()?.querySelectorAll("[role=group]") ?? [])].map((g) =>
			g.getAttribute("aria-label"),
		);
		expect(groups).toEqual(["Reader", "Everywhere"]);
		expect(options()).toEqual(["Read with RSVPR", "Import a bookCtrlO"]);
	});

	it("filters as the user types and runs the chosen row on Enter", async () => {
		vi.useFakeTimers();
		try {
			view = await render(<App />);
			await key(window, "k", { ctrlKey: true });
			await type("long");
			expect(options()).toEqual(["Go to: The Long Night"]);
			await key(input(), "Enter");
			await act(async () => vi.runAllTimers());
			expect(runChapter).toHaveBeenCalledTimes(1);
			expect(paletteOpen.get()).toBe(false);
		} finally {
			vi.useRealTimers();
		}
	});

	it("moves through rows with the arrow keys", async () => {
		vi.useFakeTimers();
		try {
			view = await render(<App />);
			await key(window, "k", { ctrlKey: true });
			await key(input(), "ArrowDown");
			await key(input(), "Enter");
			await act(async () => vi.runAllTimers());
			expect(runImport).toHaveBeenCalledTimes(1);
		} finally {
			vi.useRealTimers();
		}
	});

	it("says so when nothing matches", async () => {
		view = await render(<App />);
		await key(window, "k", { ctrlKey: true });
		await type("zzzz");
		expect(palette()?.textContent).toContain("No commands match “zzzz”");
	});
});
