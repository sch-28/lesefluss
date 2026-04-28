import { beforeEach, describe, expect, it, vi } from "vitest";
import { _resetForTests, throttle } from "../../utils/throttle";

describe("throttle", () => {
	beforeEach(() => {
		// Module-scoped queue map persists across tests; reset so order doesn't matter.
		_resetForTests();
	});

	it("two same-provider calls serialize with ≥minMs gap", async () => {
		vi.useFakeTimers();

		// Caller A — `previous` was Promise.resolve(), so this resolves immediately.
		const a = throttle("ao3", 1000);
		// Caller B — `previous` is now A's slot (sleep 1000ms), so this resolves AFTER A's sleep.
		const b = throttle("ao3", 1000);

		const aResolved = vi.fn();
		const bResolved = vi.fn();
		a.then(aResolved);
		b.then(bResolved);

		// Drain microtasks without advancing the clock — A's `previous` (Promise.resolve())
		// settles immediately; B's `previous` (A's sleep) does not.
		await vi.advanceTimersByTimeAsync(0);
		expect(aResolved).toHaveBeenCalled();
		expect(bResolved).not.toHaveBeenCalled();

		// Just before the gap closes, B is still waiting.
		await vi.advanceTimersByTimeAsync(999);
		expect(bResolved).not.toHaveBeenCalled();

		// At the gap boundary, B resolves.
		await vi.advanceTimersByTimeAsync(1);
		expect(bResolved).toHaveBeenCalled();
	});

	it("different providers don't block each other", async () => {
		vi.useFakeTimers();

		// Prime ao3's queue with a long sleep.
		void throttle("ao3", 5000);
		const aoNext = throttle("ao3", 5000);
		// scribblehub is a fresh queue — its first call resolves immediately.
		const sh = throttle("scribblehub", 5000);

		const aoResolved = vi.fn();
		const shResolved = vi.fn();
		aoNext.then(aoResolved);
		sh.then(shResolved);

		await vi.advanceTimersByTimeAsync(0);
		expect(shResolved).toHaveBeenCalled();
		expect(aoResolved).not.toHaveBeenCalled();
	});
});
