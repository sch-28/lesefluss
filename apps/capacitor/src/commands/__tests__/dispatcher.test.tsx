import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchCommandKey } from "../dispatcher";
import { isShortcutAllowed } from "../guard";
import { activeCommands, type Command, registerCommands } from "../registry";

function press(
	key: string,
	target: EventTarget = document.body,
	mods: Partial<KeyboardEventInit> = {},
) {
	const e = new KeyboardEvent("keydown", { key, cancelable: true, bubbles: true, ...mods });
	Object.defineProperty(e, "target", { value: target });
	return e;
}

function mount(html: string): HTMLElement {
	const host = document.createElement("div");
	host.innerHTML = html;
	document.body.append(host);
	return host.firstElementChild as HTMLElement;
}

const cleanups: (() => void)[] = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
	document.body.innerHTML = "";
});

function register(commands: Command[]) {
	cleanups.push(registerCommands(() => commands));
}

describe("guard", () => {
	it("blocks keys while typing", () => {
		expect(isShortcutAllowed(press("r", mount("<input />")))).toBe(false);
		expect(isShortcutAllowed(press("r", mount("<textarea></textarea>")))).toBe(false);
		expect(isShortcutAllowed(press("r", mount('<div contenteditable="true"></div>')))).toBe(false);
	});

	it("blocks keys under an open radix dialog, vaul drawer or menu", () => {
		const target = mount("<p>text</p>");
		expect(isShortcutAllowed(press("r", target))).toBe(true);
		for (const overlay of [
			'<div role="dialog" data-state="open"></div>',
			'<div data-vaul-drawer data-state="open"></div>',
			'<div role="menu" data-state="open"></div>',
		]) {
			const el = mount(overlay);
			expect(isShortcutAllowed(press("r", target))).toBe(false);
			el.remove();
		}
		mount('<div role="dialog" data-state="closed"></div>');
		expect(isShortcutAllowed(press("r", target))).toBe(true);
	});

	it("blocks keys while an inline editor that is no text field is open", () => {
		const target = mount("<p>text</p>");
		const editor = mount('<div role="group" data-inline-editor=""><button>1</button></div>');
		expect(isShortcutAllowed(press("4", target), { inControls: true })).toBe(false);
		editor.remove();
		expect(isShortcutAllowed(press("4", target), { inControls: true })).toBe(true);
	});

	it("lets only commands that allow it run with a control focused", () => {
		const button = mount("<button>Go</button>");
		expect(isShortcutAllowed(press("r", button))).toBe(false);
		expect(isShortcutAllowed(press("Escape", button), { inControls: true })).toBe(true);
	});
});

describe("dispatchCommandKey", () => {
	it("runs a key once even when two mounted screens register it", () => {
		const first = vi.fn();
		const second = vi.fn();
		register([{ id: "reader.rsvp", title: "RSVP", scope: "reader", keys: ["r"], run: first }]);
		register([{ id: "reader.rsvp", title: "RSVP", scope: "reader", keys: ["r"], run: second }]);
		const e = press("r");
		expect(dispatchCommandKey(e)).toBe(true);
		expect(first).not.toHaveBeenCalled();
		expect(second).toHaveBeenCalledTimes(1);
		expect(e.defaultPrevented).toBe(true);
	});

	it("runs only the first active match, in registration order", () => {
		const dismiss = vi.fn();
		const exit = vi.fn();
		let hasSelection = true;
		register([
			{
				id: "dismiss",
				title: "Clear selection",
				scope: "reader",
				keys: ["Escape"],
				when: () => hasSelection,
				inControls: true,
				run: dismiss,
			},
			{ id: "exit", title: "Leave RSVP", scope: "rsvp", keys: ["Escape"], run: exit },
		]);
		const button = mount("<button>Highlight</button>");
		dispatchCommandKey(press("Escape", button));
		expect(dismiss).toHaveBeenCalledTimes(1);
		expect(exit).not.toHaveBeenCalled();

		hasSelection = false;
		dispatchCommandKey(press("Escape"));
		expect(exit).toHaveBeenCalledTimes(1);
		// With a focused control, Escape is the control's own.
		dispatchCommandKey(press("Escape", button));
		expect(exit).toHaveBeenCalledTimes(1);
	});

	it("leaves a key alone while typing, unless the command claims it from the browser", () => {
		const run = vi.fn();
		register([
			{ id: "r", title: "RSVP", scope: "reader", keys: ["r"], run },
			{ id: "o", title: "Import", scope: "global", keys: ["Mod+O"], claimsKeys: true, run },
		]);
		const input = mount("<input />");
		const typed = press("r", input);
		expect(dispatchCommandKey(typed)).toBe(false);
		expect(typed.defaultPrevented).toBe(false);
		const open = press("o", input, { ctrlKey: true });
		expect(dispatchCommandKey(open)).toBe(false);
		expect(open.defaultPrevented).toBe(true);
		expect(run).not.toHaveBeenCalled();
	});

	it("skips commands that are off", () => {
		register([
			{ id: "x", title: "X", scope: "reader", keys: ["x"], when: () => false, run: vi.fn() },
		]);
		expect(activeCommands()).toEqual([]);
		expect(dispatchCommandKey(press("x"))).toBe(false);
	});
});
