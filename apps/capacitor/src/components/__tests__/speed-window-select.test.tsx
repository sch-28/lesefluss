import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { click, type Rendered, render } from "../../test/render";

const mutate = vi.hoisted(() => vi.fn());
vi.mock("../../services/db/hooks", () => ({
	queryHooks: { useSaveSettings: () => ({ mutate }) },
}));

const { SpeedWindowSelect } = await import("../speed-window-select");

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	vi.clearAllMocks();
});

async function pick(label: string) {
	const trigger = view?.container.querySelector<HTMLElement>("[data-testid=speed-window-select]");
	if (!trigger) throw new Error("no trigger");
	await act(async () => {
		trigger.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
	});
	const item = [...document.querySelectorAll<HTMLElement>("[role=menuitem]")].find(
		(el) => el.textContent === label,
	);
	if (!item) throw new Error(`no item ${label}`);
	await click(item);
}

describe("SpeedWindowSelect", () => {
	it("saves the window the reader picks", async () => {
		view = await render(<SpeedWindowSelect window="recent" />);
		await pick("30 days");
		expect(mutate).toHaveBeenCalledWith({ speedWindow: "30d" });
	});

	it("saves nothing when the current window is picked again", async () => {
		view = await render(<SpeedWindowSelect window="30d" />);
		await pick("30 days");
		expect(mutate).not.toHaveBeenCalled();
	});
});
