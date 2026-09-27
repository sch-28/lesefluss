import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();

vi.mock("@capacitor/preferences", () => ({
	Preferences: {
		get: vi.fn(async ({ key }: { key: string }) => ({ value: store.get(key) ?? null })),
		set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
			store.set(key, value);
		}),
		remove: vi.fn(async ({ key }: { key: string }) => {
			store.delete(key);
		}),
	},
}));
vi.mock("@capacitor/app", () => ({ App: { addListener: vi.fn(), getLaunchUrl: vi.fn() } }));
vi.mock("@capacitor/browser", () => ({ Browser: { open: vi.fn() } }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock("../../db/queries", () => ({ queries: { getSettings: vi.fn() } }));
vi.mock("../../sync/auth-client", () => ({
	SYNC_URL: "https://lesefluss.app",
	syncAuthClient: null,
}));

import type { AnyRouter } from "@tanstack/react-router";
import { setPendingLink } from "../pending-link";
import { navigateToLink, replayPendingLink } from "../use-deep-links";

function fakeRouter() {
	const navigate = vi.fn();
	return { router: { navigate } as unknown as AnyRouter, navigate };
}

describe("pending link replay", () => {
	beforeEach(() => store.clear());

	it("navigates to the stored invite once and forgets it", async () => {
		await setPendingLink({ kind: "invite", token: "tok" });
		const { router, navigate } = fakeRouter();
		expect(await replayPendingLink(router)).toBe(true);
		expect(navigate).toHaveBeenLastCalledWith({
			to: "/tabs/social/invite/$token",
			params: { token: "tok" },
		});
		expect(await replayPendingLink(router)).toBe(false);
	});

	it("does nothing for an expired link", async () => {
		await setPendingLink({ kind: "invite", token: "tok" }, Date.now() - 25 * 60 * 60_000);
		const { router, navigate } = fakeRouter();
		expect(await replayPendingLink(router)).toBe(false);
		expect(navigate).not.toHaveBeenCalled();
	});

	it("seeds the Social tab underneath a cold-start destination", () => {
		const { router, navigate } = fakeRouter();
		vi.spyOn(window.history, "length", "get").mockReturnValue(1);
		navigateToLink(router, { kind: "invite", token: "tok" });
		expect(navigate.mock.calls.map((c) => c[0].to)).toEqual([
			"/tabs/social",
			"/tabs/social/invite/$token",
		]);

		navigate.mockClear();
		vi.spyOn(window.history, "length", "get").mockReturnValue(3);
		navigateToLink(router, { kind: "invite", token: "tok" });
		expect(navigate.mock.calls.map((c) => c[0].to)).toEqual(["/tabs/social/invite/$token"]);
	});
});
