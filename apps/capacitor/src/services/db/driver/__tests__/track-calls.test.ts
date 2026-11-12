import { afterEach, describe, expect, it, vi } from "vitest";
import { trackCalls } from "../track-calls";
import type { DbDriver } from "../types";

function slowDriver() {
	const finishes: Array<() => void> = [];
	const pending = () => new Promise<void>((resolve) => finishes.push(resolve));
	const driver = {
		kind: "opfs",
		open: async () => {},
		close: async () => {},
		deleteDatabase: async () => {},
		run: pending,
		query: async () => [],
		execute: pending,
		begin: pending,
		commit: pending,
		rollback: pending,
	} as unknown as DbDriver;
	return { driver, finishNext: () => finishes.shift()?.() };
}

describe("trackCalls", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("settles only after the running statement ended and a quiet stretch passed", async () => {
		vi.useFakeTimers();
		const { driver, finishNext } = slowDriver();
		const tracked = trackCalls(driver);
		const write = tracked.driver.run("UPDATE books SET word_position = 1");

		let settled = false;
		void tracked.settled(100, 5000).then(() => {
			settled = true;
		});
		await vi.advanceTimersByTimeAsync(1000);
		expect(settled).toBe(false);

		finishNext();
		await write;
		await vi.advanceTimersByTimeAsync(50);
		expect(settled).toBe(false);
		await vi.advanceTimersByTimeAsync(100);
		expect(settled).toBe(true);
	});

	it("gives up waiting at the limit", async () => {
		vi.useFakeTimers();
		const { driver } = slowDriver();
		const tracked = trackCalls(driver);
		void tracked.driver.run("UPDATE books SET word_position = 1");

		const done = tracked.settled(100, 2000);
		await vi.advanceTimersByTimeAsync(2000);
		await expect(done).resolves.toBeUndefined();
	});

	it("passes results and failures through", async () => {
		const failing = {
			...slowDriver().driver,
			query: async () => [{ id: "b1" }],
			run: async () => {
				throw new Error("disk I/O error");
			},
		} as DbDriver;
		const tracked = trackCalls(failing);
		await expect(tracked.driver.query("SELECT id FROM books")).resolves.toEqual([{ id: "b1" }]);
		await expect(tracked.driver.run("UPDATE books SET title = 1")).rejects.toThrow("disk I/O");
	});
});
