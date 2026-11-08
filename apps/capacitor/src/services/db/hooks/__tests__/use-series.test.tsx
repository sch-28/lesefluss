import type { UseQueryResult } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { flush, render } from "../../../../test/render";

const getSeries = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("../../queries", () => ({ queries: { getSeries } }));
vi.mock("../../../serial-scrapers", () => ({ pollChapterList: vi.fn(), removeSerial: vi.fn() }));

const { seriesHooks } = await import("../use-series");

describe("useSeries", () => {
	it("settles an unknown id as null instead of a query error", async () => {
		let result: UseQueryResult | undefined;
		function Probe() {
			result = seriesHooks.useSeries("no-such-series");
			return null;
		}
		const view = await render(<Probe />);
		await flush();
		expect(result?.status).toBe("success");
		expect(result?.data).toBeNull();
		view.unmount();
	});
});
