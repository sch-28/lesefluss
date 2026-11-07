import { beforeEach, describe, expect, it, vi } from "vitest";
import { reportCollectionWriteError } from "../use-collections";

const toastError = vi.hoisted(() => vi.fn());
const reportEvent = vi.hoisted(() => vi.fn());

vi.mock("../../../../components/toast", () => ({ toast: { error: toastError } }));
vi.mock("../../../telemetry", () => ({
	reportEvent,
	errorMessage: (err: unknown) => (err instanceof Error ? err.message : String(err)),
}));
vi.mock("../../../sync", () => ({ scheduleSyncPush: vi.fn() }));

beforeEach(() => {
	toastError.mockReset();
	reportEvent.mockReset();
});

describe("reportCollectionWriteError", () => {
	it("tells the user and sends the cause to telemetry", () => {
		reportCollectionWriteError(new Error("SQLITE_BUSY"));
		expect(toastError).toHaveBeenCalledWith("Couldn't save the collection");
		expect(reportEvent).toHaveBeenCalledWith("collection_write_error", { message: "SQLITE_BUSY" });
	});
});
