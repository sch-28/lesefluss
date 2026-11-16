import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../../test/render";
import { readingSessionKeys, statsKeys } from "../query-keys";

const deleteReadingSessionsEverywhere = vi.hoisted(() =>
	vi.fn(async (_ids: readonly string[]) => {}),
);

vi.mock("../../../sync", () => ({
	deleteServerSession: vi.fn(),
	deleteReadingSessionsEverywhere,
	scheduleSyncPush: vi.fn(),
}));
vi.mock("../../../../components/toast", () => ({ toast: { error: vi.fn() } }));

const { readingSessionHooks } = await import("../use-reading-sessions");

describe("useDeleteReadingSessions", () => {
	it("deletes everywhere, then refreshes the session list and the stats", async () => {
		let mutate: ((ids: string[]) => Promise<void>) | undefined;
		function Probe() {
			mutate = readingSessionHooks.useDeleteReadingSessions().mutateAsync;
			return null;
		}
		const view: Rendered = await render(<Probe />);
		const invalidate = vi.spyOn(view.queryClient, "invalidateQueries");
		await act(async () => {
			await mutate?.(["a"]);
		});
		expect(deleteReadingSessionsEverywhere.mock.calls[0]?.[0]).toEqual(["a"]);
		const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
		expect(keys).toContainEqual(readingSessionKeys.all);
		expect(keys).toContainEqual(statsKeys.all);
		view.unmount();
	});
});
