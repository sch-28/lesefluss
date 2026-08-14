import { describe, expect, it, vi } from "vitest";
import { runSequential, type SequentialProgress } from "../run-sequential";

const describeError = (err: unknown) => (err instanceof Error ? err.message : "failed");
const label = (item: string) => item;

describe("runSequential", () => {
	it("runs every item in order", async () => {
		const seen: string[] = [];
		const result = await runSequential({
			items: ["a", "b", "c"],
			run: async (item) => {
				seen.push(item);
			},
			label,
			describeError,
		});

		expect(seen).toEqual(["a", "b", "c"]);
		expect(result).toEqual({ succeeded: 3, failures: [], cancelled: false });
	});

	// The whole reason this abstraction exists: a loop without a per-item catch
	// abandons everything after the first throw.
	it("records a failure and keeps going", async () => {
		const result = await runSequential({
			items: ["good", "bad", "also-good"],
			run: async (item) => {
				if (item === "bad") throw new Error("BROKEN");
			},
			label,
			describeError,
		});

		expect(result.succeeded).toBe(2);
		expect(result.failures).toEqual([{ item: "bad", reason: "BROKEN" }]);
	});

	it("describes a failure through the caller's mapper", async () => {
		const result = await runSequential({
			items: ["x"],
			run: async () => {
				throw new Error("RAW_CODE");
			},
			label,
			describeError: () => "Something a reader can read",
		});
		expect(result.failures[0].reason).toBe("Something a reader can read");
	});

	it("stops after the in-flight item when cancelled, keeping what succeeded", async () => {
		let cancelled = false;
		const seen: string[] = [];
		const result = await runSequential({
			items: ["a", "b", "c"],
			run: async (item) => {
				seen.push(item);
				if (item === "b") cancelled = true;
			},
			label,
			describeError,
			isCancelled: () => cancelled,
		});

		expect(seen).toEqual(["a", "b"]);
		expect(result).toEqual({ succeeded: 2, failures: [], cancelled: true });
	});

	it("reports progress per item and finishes at the total", async () => {
		const progress: SequentialProgress[] = [];
		await runSequential({
			items: ["a", "b"],
			run: async () => undefined,
			label,
			describeError,
			onProgress: (p) => progress.push({ ...p }),
		});

		expect(progress).toEqual([
			{ done: 0, total: 2, current: "a" },
			{ done: 1, total: 2, current: "b" },
			{ done: 2, total: 2, current: "" },
		]);
	});

	it("never runs two items concurrently", async () => {
		let inFlight = 0;
		let maxInFlight = 0;
		await runSequential({
			items: ["a", "b", "c"],
			run: async () => {
				inFlight += 1;
				maxInFlight = Math.max(maxInFlight, inFlight);
				await new Promise((resolve) => setTimeout(resolve, 1));
				inFlight -= 1;
			},
			label,
			describeError,
		});
		expect(maxInFlight).toBe(1);
	});

	it("does nothing when there are no items", async () => {
		const run = vi.fn();
		const result = await runSequential({ items: [], run, label, describeError });
		expect(run).not.toHaveBeenCalled();
		expect(result).toEqual({ succeeded: 0, failures: [], cancelled: false });
	});
});
