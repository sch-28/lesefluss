import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../test/render";
import { useValueWhenIdle } from "../use-value-when-idle";

let view: Rendered | undefined;
let shown: number | undefined;
let isBusy = false;
const busyChecks = vi.fn(() => isBusy);

function Probe({ value }: { value: number }) {
	shown = useValueWhenIdle(value, busyChecks);
	return null;
}

beforeEach(() => {
	vi.useFakeTimers();
	isBusy = false;
	busyChecks.mockClear();
});

afterEach(() => {
	view?.unmount();
	view = undefined;
	vi.useRealTimers();
});

describe("useValueWhenIdle", () => {
	it("takes a new value at once while idle", async () => {
		view = await render(<Probe value={1} />);
		await view.rerender(<Probe value={2} />);
		expect(shown).toBe(2);
	});

	it("holds a new value while busy, across several checks, and takes it once idle", async () => {
		view = await render(<Probe value={1} />);
		isBusy = true;
		await view.rerender(<Probe value={2} />);

		await act(() => vi.advanceTimersByTimeAsync(350));
		expect(shown).toBe(1);

		isBusy = false;
		await act(() => vi.advanceTimersByTimeAsync(100));
		expect(shown).toBe(2);
	});

	it("stops checking once unmounted", async () => {
		view = await render(<Probe value={1} />);
		isBusy = true;
		await view.rerender(<Probe value={2} />);
		view.unmount();
		view = undefined;
		const checks = busyChecks.mock.calls.length;

		await vi.advanceTimersByTimeAsync(1000);

		expect(busyChecks.mock.calls.length).toBe(checks);
	});
});
