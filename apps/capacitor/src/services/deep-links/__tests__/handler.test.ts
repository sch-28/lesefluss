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
import { takePendingLink } from "../pending-link";
import { createDeepLinkHandler } from "../use-deep-links";

const TOKEN = "Ab3dEf7hIj9kLmNoPqRsTuVwXyZ0123456789_-abcd";
const INVITE = `https://lesefluss.app/invite/${TOKEN}`;

function setup(options: { onboardingCompleted?: boolean } = {}) {
	const navigate = vi.fn();
	const openInBrowser = vi.fn(async () => {});
	let clock = 10_000;
	const handle = createDeepLinkHandler({
		router: { navigate, history: { canGoBack: () => true } } as unknown as AnyRouter,
		isOnboardingCompleted: async () => options.onboardingCompleted ?? true,
		openInBrowser,
		now: () => clock,
	});
	return { handle, navigate, openInBrowser, advance: (ms: number) => (clock += ms) };
}

describe("deep link handler", () => {
	beforeEach(() => {
		store.clear();
		vi.spyOn(window.history, "length", "get").mockReturnValue(5);
	});

	it("navigates to the invite screen for a valid link", async () => {
		const { handle, navigate } = setup();
		await handle(INVITE);
		expect(navigate).toHaveBeenCalledWith({
			to: "/tabs/social/invite/$token",
			params: { token: TOKEN },
		});
	});

	it("ignores the auth callback scheme and foreign URLs", async () => {
		const { handle, navigate, openInBrowser } = setup();
		await handle("lesefluss://auth-callback?state=x&token=y");
		await handle("https://evil.example/invite/" + TOKEN);
		await handle("https://lesefluss.app/app/tabs/library");
		expect(navigate).not.toHaveBeenCalled();
		expect(openInBrowser).not.toHaveBeenCalled();
	});

	it("opens an unknown claimed path in the browser instead of looping", async () => {
		const { handle, navigate, openInBrowser } = setup();
		await handle("https://lesefluss.app/invite/something-new");
		expect(openInBrowser).toHaveBeenCalledWith("https://lesefluss.app/invite/something-new");
		expect(navigate).not.toHaveBeenCalled();
	});

	it("stores the link and sends the user to onboarding when it is not finished", async () => {
		const { handle, navigate } = setup({ onboardingCompleted: false });
		await handle(INVITE);
		expect(navigate).toHaveBeenCalledWith({ to: "/onboarding", replace: true });
		expect(await takePendingLink()).toEqual({ kind: "invite", token: TOKEN });
	});

	it("collapses a cold-start double delivery but handles the same link again later", async () => {
		const { handle, navigate, advance } = setup();
		await handle(INVITE);
		await handle(INVITE);
		expect(navigate).toHaveBeenCalledTimes(1);
		advance(5_000);
		await handle(INVITE);
		expect(navigate).toHaveBeenCalledTimes(2);
	});
});
