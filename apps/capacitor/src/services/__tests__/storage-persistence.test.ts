import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestPersistentStorage } from "../storage-persistence";

function storage(granted: boolean, alreadyPersisted = false) {
	return {
		persisted: vi.fn(async () => alreadyPersisted),
		persist: vi.fn(async () => granted),
		estimate: vi.fn(async () => ({ usage: 10, quota: 100 })),
	};
}

beforeEach(() => {
	localStorage.clear();
	vi.spyOn(console, "log").mockImplementation(() => {});
	vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("requestPersistentStorage", () => {
	it("asks once and reports the answer to the console", async () => {
		const s = storage(true);
		await requestPersistentStorage(s as unknown as StorageManager);
		await requestPersistentStorage(s as unknown as StorageManager);
		expect(s.persist).toHaveBeenCalledOnce();
		expect(console.log).toHaveBeenCalledWith(
			expect.stringContaining("[storage]"),
			"persistent storage granted",
			{ usage: 10, quota: 100 },
		);
	});

	it("reports a refusal and does not ask again", async () => {
		const s = storage(false);
		await requestPersistentStorage(s as unknown as StorageManager);
		await requestPersistentStorage(s as unknown as StorageManager);
		expect(s.persist).toHaveBeenCalledOnce();
		expect(console.log).toHaveBeenCalledWith(
			expect.anything(),
			"persistent storage refused",
			expect.anything(),
		);
	});

	it("does not ask when the storage is already persistent", async () => {
		const s = storage(false, true);
		await requestPersistentStorage(s as unknown as StorageManager);
		expect(s.persist).not.toHaveBeenCalled();
	});

	it("does nothing where the browser lacks the API", async () => {
		await expect(requestPersistentStorage(undefined)).resolves.toBeUndefined();
		await expect(
			requestPersistentStorage({} as unknown as StorageManager),
		).resolves.toBeUndefined();
		expect(console.log).not.toHaveBeenCalled();
	});

	it("keeps a failed request to a warning and asks again next start", async () => {
		const s = storage(true);
		s.persist.mockRejectedValueOnce(new Error("denied"));
		await requestPersistentStorage(s as unknown as StorageManager);
		expect(console.warn).toHaveBeenCalled();
		await requestPersistentStorage(s as unknown as StorageManager);
		expect(s.persist).toHaveBeenCalledTimes(2);
	});
});
