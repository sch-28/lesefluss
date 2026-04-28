import { afterEach, vi } from "vitest";

afterEach(() => {
	// Reset module mocks (vi.mock factories) and restore spies between tests.
	vi.restoreAllMocks();
	vi.useRealTimers();
});
