import { describe, expect, it, vi } from "vitest";
import { type LaunchRouteDeps, resolveLaunchRoute } from "./launch-route";

const AUTO_OPEN = { onboardingCompleted: true, autoOpenLastBook: true };

function deps(overrides: Partial<LaunchRouteDeps> = {}): LaunchRouteDeps {
	return {
		getLastReadBookId: vi.fn(async () => "b1"),
		launchHasIntent: vi.fn(async () => false),
		...overrides,
	};
}

describe("resolveLaunchRoute", () => {
	it("sends unfinished onboarding to onboarding, even with auto-open on", async () => {
		const d = deps();
		const route = await resolveLaunchRoute({ ...AUTO_OPEN, onboardingCompleted: false }, d);
		expect(route).toEqual({ to: "/onboarding" });
		expect(d.getLastReadBookId).not.toHaveBeenCalled();
	});

	it("opens the library when auto-open is off", async () => {
		const d = deps();
		const route = await resolveLaunchRoute({ ...AUTO_OPEN, autoOpenLastBook: false }, d);
		expect(route).toEqual({ to: "/tabs/library" });
		expect(d.getLastReadBookId).not.toHaveBeenCalled();
	});

	it("opens the last-read book when auto-open is on", async () => {
		expect(await resolveLaunchRoute(AUTO_OPEN, deps())).toEqual({
			to: "/tabs/reader/$id",
			bookId: "b1",
		});
	});

	it("leaves the first screen to a launch intent (deep link, auth callback, share)", async () => {
		const d = deps({ launchHasIntent: async () => true });
		expect(await resolveLaunchRoute(AUTO_OPEN, d)).toEqual({ to: "/tabs/library" });
		expect(d.getLastReadBookId).not.toHaveBeenCalled();
	});

	it("falls back to the library when nothing was read yet or a lookup fails", async () => {
		const failing = () => Promise.reject(new Error("db closed"));
		for (const d of [
			deps({ getLastReadBookId: async () => null }),
			deps({ getLastReadBookId: failing }),
		]) {
			expect(await resolveLaunchRoute(AUTO_OPEN, d)).toEqual({ to: "/tabs/library" });
		}
		expect(await resolveLaunchRoute(AUTO_OPEN, deps({ launchHasIntent: failing }))).toEqual({
			to: "/tabs/reader/$id",
			bookId: "b1",
		});
	});
});
