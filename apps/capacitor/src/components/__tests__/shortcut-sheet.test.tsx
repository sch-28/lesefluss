import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCommandDispatcher } from "../../commands/dispatcher";
import { shortcutSheetOpen } from "../../commands/global";
import { type Command, useRegisterCommands } from "../../commands/registry";
import { type Rendered, render } from "../../test/render";
import ShortcutSheet from "../shortcut-sheet";

const COMMANDS: Command[] = [
	{
		id: "global.shortcuts",
		title: "Keyboard shortcuts",
		scope: "global",
		keys: ["?"],
		run: () => shortcutSheetOpen.set(true),
	},
	{ id: "reader.fullscreen", title: "Fullscreen", scope: "reader", keys: ["f"], run: vi.fn() },
	{ id: "page.next", title: "Next page", scope: "page", keys: ["ArrowRight"], run: vi.fn() },
	{
		id: "rsvp.play",
		title: "Play or pause",
		scope: "rsvp",
		keys: ["Space"],
		when: () => false,
		run: vi.fn(),
	},
];

function App({ extra = [] }: { extra?: Command[] }) {
	useCommandDispatcher();
	useRegisterCommands([...COMMANDS, ...extra]);
	return <ShortcutSheet />;
}

let view: Rendered | null = null;
afterEach(() => {
	view?.unmount();
	view = null;
	act(() => shortcutSheetOpen.set(false));
});

const sheet = () => document.querySelector<HTMLElement>("[data-testid=shortcut-sheet]");
const groupLabels = () =>
	[...(sheet()?.querySelectorAll("[data-testid=shortcut-group]") ?? [])].map((g) =>
		g.getAttribute("aria-label"),
	);

async function pressQuestionMark(target: EventTarget = window) {
	await act(async () => {
		target.dispatchEvent(
			new KeyboardEvent("keydown", { key: "?", shiftKey: true, bubbles: true, cancelable: true }),
		);
	});
}

describe("ShortcutSheet", () => {
	it("opens on ? and lists the active keys, the current mode's group first", async () => {
		view = await render(<App />);
		await pressQuestionMark();
		expect(groupLabels()).toEqual(["Page and scroll", "Reader", "Everywhere"]);
		expect(sheet()?.textContent).toContain("Fullscreen");
		expect(sheet()?.textContent).not.toContain("Play or pause");
	});

	it("lists a command registered elsewhere under its own scope", async () => {
		view = await render(
			<App
				extra={[
					{ id: "listen.toggle", title: "Read aloud", scope: "listen", keys: ["l"], run: vi.fn() },
				]}
			/>,
		);
		await pressQuestionMark();
		const listen = sheet()?.querySelector("[aria-label=Listen]");
		expect(listen?.textContent).toContain("Read aloud");
	});

	it("does not open while typing", async () => {
		view = await render(<App />);
		const field = document.createElement("input");
		document.body.appendChild(field);
		try {
			await pressQuestionMark(field);
			expect(sheet()).toBeNull();
		} finally {
			field.remove();
		}
	});
});
