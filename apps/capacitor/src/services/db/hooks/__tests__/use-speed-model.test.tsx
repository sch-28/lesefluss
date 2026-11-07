import { describe, expect, it, vi } from "vitest";
import { flush, render } from "../../../../test/render";

const getSettings = vi.hoisted(() => vi.fn());
const getSpeedModel = vi.hoisted(() =>
	vi.fn(async ({ window }: { window: string }) => ({ window })),
);

vi.mock("../../queries", () => ({ queries: { getSettings, getSpeedModel } }));
vi.mock("../../../sync", () => ({ scheduleSyncPush: vi.fn() }));

const { statsHooks } = await import("../use-stats");

describe("useSpeedModel", () => {
	it("reads the window the reader picked", async () => {
		getSettings.mockResolvedValue({ speedWindow: "30d" });
		let window: string | undefined;
		function Probe() {
			window = statsHooks.useSpeedModel().data?.window;
			return null;
		}
		const view = await render(<Probe />);
		await flush();
		await flush();
		expect(window).toBe("30d");
		expect(getSpeedModel.mock.calls.at(-1)?.[0]).toMatchObject({ window: "30d" });
		view.unmount();
	});
});
