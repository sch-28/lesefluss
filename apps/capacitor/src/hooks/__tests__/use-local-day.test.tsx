import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../test/render";
import { localDateKey } from "../../utils/date-utils";
import { useLocalDayNow } from "../use-local-day";

function Day() {
	return <span>{localDateKey(useLocalDayNow())}</span>;
}

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

describe("useLocalDayNow", () => {
	it("stays on the day while it lasts and moves to the next one at midnight", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
		vi.setSystemTime(new Date(2026, 2, 1, 23, 0));
		view = await render(<Day />);
		expect(view.text()).toBe("2026-03-01");

		await act(async () => {
			vi.advanceTimersByTime(30 * 60_000);
		});
		expect(view.text()).toBe("2026-03-01");

		await act(async () => {
			vi.advanceTimersByTime(32 * 60_000);
		});
		expect(view.text()).toBe("2026-03-02");
	});

	it("catches up on return to the app after a day has passed", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date(2026, 2, 1, 22, 0));
		view = await render(<Day />);
		vi.setSystemTime(new Date(2026, 2, 3, 8, 0));
		await act(async () => {
			document.dispatchEvent(new Event("visibilitychange"));
		});
		expect(view.text()).toBe("2026-03-03");
	});
});
