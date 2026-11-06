import { act, useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { tabBarHidden } from "../../../components/app-shell/tab-bar-visibility";
import { type Rendered, render } from "../../../test/render";
import BulkActionBar from "../bulk-action-bar";
import { useDragSelect } from "../use-drag-select";
import type { UseLibrarySelection } from "../use-library-selection";

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

function Grid(props: { isActive: boolean; onOver: (id: string) => void; onEnd: () => void }) {
	const ref = useRef<HTMLDivElement>(null);
	useDragSelect(ref, props);
	return (
		<div ref={ref} data-testid="grid">
			<div data-book-id="b1">one</div>
		</div>
	);
}

function move(): TouchEvent {
	const e = new TouchEvent("touchmove", { bubbles: true, cancelable: true });
	Object.defineProperty(e, "touches", { value: [{ clientX: 1, clientY: 1 }] });
	act(() => {
		window.dispatchEvent(e);
	});
	return e;
}

describe("useDragSelect", () => {
	it("holds the page still and follows the finger only while a drag runs", async () => {
		const onOver = vi.fn();
		const onEnd = vi.fn();
		const book = () => view?.container.querySelector("[data-book-id]") ?? null;
		vi.spyOn(document, "elementFromPoint").mockImplementation(() => book());
		view = await render(<Grid isActive={false} onOver={onOver} onEnd={onEnd} />);
		expect(move().defaultPrevented).toBe(false);
		expect(onOver).not.toHaveBeenCalled();

		await view.rerender(<Grid isActive onOver={onOver} onEnd={onEnd} />);
		const grid = view.container.querySelector<HTMLElement>("[data-testid=grid]");
		expect(grid?.style.touchAction).toBe("none");
		expect(move().defaultPrevented).toBe(true);
		expect(onOver).toHaveBeenCalledWith("b1");
		act(() => {
			window.dispatchEvent(new TouchEvent("touchend"));
		});
		expect(onEnd).toHaveBeenCalledOnce();

		await view.rerender(<Grid isActive={false} onOver={onOver} onEnd={onEnd} />);
		expect(grid?.style.touchAction).toBe("");
		expect(move().defaultPrevented).toBe(false);
		vi.restoreAllMocks();
	});
});

describe("BulkActionBar", () => {
	it("takes the tab bar's place while it is shown", async () => {
		const selection = {
			isRunning: false,
			picked: [],
			progress: { done: 0, total: 0 },
			exit: vi.fn(),
			allVisibleSelected: false,
			visibleCount: 0,
			toggleAllVisible: vi.fn(),
			openSheet: vi.fn(),
		} as unknown as UseLibrarySelection;
		expect(tabBarHidden.get()).toBe(false);
		view = await render(<BulkActionBar selection={selection} />);
		expect(tabBarHidden.get()).toBe(true);
		view.unmount();
		view = undefined;
		expect(tabBarHidden.get()).toBe(false);
	});
});
