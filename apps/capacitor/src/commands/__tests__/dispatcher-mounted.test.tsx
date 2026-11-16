import { Dialog, DialogContent, DialogTitle } from "@lesefluss/ui/dialog";
import { Drawer, DrawerContent, DrawerTitle } from "@lesefluss/ui/drawer";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../test/render";
import { useCommandDispatcher } from "../dispatcher";
import { type Command, registerCommands } from "../registry";

function Dispatcher() {
	useCommandDispatcher();
	return null;
}

const cleanups: (() => void)[] = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
	document.body.innerHTML = "";
});

async function mount(ui: React.ReactElement): Promise<Rendered> {
	const rendered = await render(ui);
	cleanups.push(rendered.unmount);
	return rendered;
}

function register(commands: Command[]) {
	cleanups.push(registerCommands(() => commands));
}

function keydown(key: string, target: EventTarget = document.body) {
	const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
	act(() => {
		target.dispatchEvent(e);
	});
	return e;
}

describe("useCommandDispatcher", () => {
	it("holds reader keys while a real dialog or drawer is open", async () => {
		const run = vi.fn();
		register([{ id: "reader.rsvp", title: "RSVP", scope: "reader", keys: ["r"], run }]);
		const view = await mount(<Dispatcher />);

		await view.rerender(
			<>
				<Dispatcher />
				<Dialog open>
					<DialogContent>
						<DialogTitle>Dialog</DialogTitle>
					</DialogContent>
				</Dialog>
			</>,
		);
		keydown("r");
		expect(run).not.toHaveBeenCalled();

		await view.rerender(
			<>
				<Dispatcher />
				<Drawer open>
					<DrawerContent>
						<DrawerTitle>Drawer</DrawerTitle>
					</DrawerContent>
				</Drawer>
			</>,
		);
		keydown("r");
		expect(run).not.toHaveBeenCalled();

		await view.rerender(<Dispatcher />);
		keydown("r");
		expect(run).toHaveBeenCalledTimes(1);
	});

	it("leaves a key to a widget that handled it first", async () => {
		const run = vi.fn();
		register([{ id: "reader.next", title: "Next", scope: "reader", keys: ["ArrowRight"], run }]);
		await mount(<Dispatcher />);
		const widget = document.createElement("div");
		widget.addEventListener("keydown", (e) => e.preventDefault());
		document.body.append(widget);

		keydown("ArrowRight", widget);
		expect(run).not.toHaveBeenCalled();
		keydown("ArrowRight");
		expect(run).toHaveBeenCalledTimes(1);
	});

	it("runs a claiming command before the page sees the key", async () => {
		const run = vi.fn();
		register([
			{
				id: "app.palette",
				title: "Palette",
				scope: "global",
				keys: ["Mod+K"],
				claimsKeys: true,
				run,
			},
		]);
		await mount(<Dispatcher />);
		const widget = document.createElement("div");
		const sawDefaultPrevented = vi.fn();
		widget.addEventListener("keydown", (e) => sawDefaultPrevented(e.defaultPrevented));
		document.body.append(widget);

		const e = new KeyboardEvent("keydown", {
			key: "k",
			ctrlKey: true,
			bubbles: true,
			cancelable: true,
		});
		act(() => {
			widget.dispatchEvent(e);
		});
		expect(run).toHaveBeenCalledTimes(1);
		expect(sawDefaultPrevented).toHaveBeenCalledWith(true);
	});

	it("runs a command once per press", async () => {
		const run = vi.fn();
		register([{ id: "reader.rsvp", title: "RSVP", scope: "reader", keys: ["r"], run }]);
		await mount(<Dispatcher />);
		keydown("r");
		expect(run).toHaveBeenCalledTimes(1);
	});
});
