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
import { takePendingLink } from "../../deep-links/pending-link";
import { openPushTarget, type PushTapDeps, parsePushTarget } from "../tap";

const READ_ID = "11111111-2222-4333-8444-555555555555";
const ITEM_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function deps(overrides: Partial<PushTapDeps> = {}) {
	const navigate = vi.fn();
	const markRead = vi.fn(async () => {});
	const all: PushTapDeps = {
		router: { navigate, history: { canGoBack: () => true } } as unknown as AnyRouter,
		isSignedIn: async () => true,
		isOnboardingCompleted: async () => true,
		markRead,
		buddyReadExists: async () => true,
		...overrides,
	};
	return { all, navigate, markRead };
}

describe("parsePushTarget", () => {
	it("accepts only the routes the server sends", () => {
		expect(parsePushTarget({ route: "/tabs/social/inbox", inboxItemId: ITEM_ID })).toEqual({
			link: { kind: "inbox" },
			inboxItemId: ITEM_ID,
		});
		expect(parsePushTarget({ route: `/tabs/social/buddy-read/${READ_ID}` })?.link).toEqual({
			kind: "buddy-read",
			buddyReadId: READ_ID,
		});
		expect(
			parsePushTarget({ route: `/tabs/social/buddy-read-discussion/${READ_ID}` })?.link,
		).toEqual({ kind: "buddy-read-discussion", buddyReadId: READ_ID });
		for (const route of [
			"/tabs/settings/sync",
			`/tabs/social/buddy-read/${READ_ID}/../../settings`,
			"/tabs/social/buddy-read/not-a-uuid",
			"https://evil.example/tabs/social/inbox",
			42,
		]) {
			expect(parsePushTarget({ route })).toBeNull();
		}
		expect(parsePushTarget(null)).toBeNull();
	});

	it("drops an inbox item id that is not a uuid", () => {
		expect(
			parsePushTarget({ route: "/tabs/social/inbox", inboxItemId: "x" })?.inboxItemId,
		).toBeNull();
	});
});

describe("openPushTarget", () => {
	beforeEach(() => store.clear());

	it("opens the screen and marks the item read", async () => {
		const { all, navigate, markRead } = deps();
		await openPushTarget(all, {
			route: `/tabs/social/buddy-read-discussion/${READ_ID}`,
			inboxItemId: ITEM_ID,
		});
		expect(markRead).toHaveBeenCalledWith(ITEM_ID);
		expect(navigate).toHaveBeenLastCalledWith({
			to: "/tabs/social/buddy-read-discussion/$id",
			params: { id: READ_ID },
		});
	});

	it("lands on the inbox when the buddy read is gone", async () => {
		const { all, navigate } = deps({ buddyReadExists: async () => false });
		await openPushTarget(all, { route: `/tabs/social/buddy-read/${READ_ID}` });
		expect(navigate).toHaveBeenLastCalledWith({ to: "/tabs/social/inbox" });
	});

	it("opens the Social tab when signed out or the payload is unknown", async () => {
		const signedOut = deps({ isSignedIn: async () => false });
		await openPushTarget(signedOut.all, { route: "/tabs/social/inbox", inboxItemId: ITEM_ID });
		expect(signedOut.navigate).toHaveBeenLastCalledWith({ to: "/tabs/social" });
		expect(signedOut.markRead).not.toHaveBeenCalled();

		const unknown = deps();
		await openPushTarget(unknown.all, { route: "/tabs/settings/sync" });
		expect(unknown.navigate).toHaveBeenLastCalledWith({ to: "/tabs/social" });
	});

	it("keeps the target for after onboarding", async () => {
		const { all, navigate } = deps({ isOnboardingCompleted: async () => false });
		await openPushTarget(all, { route: `/tabs/social/buddy-read/${READ_ID}` });
		expect(navigate).toHaveBeenLastCalledWith({ to: "/onboarding", replace: true });
		expect(await takePendingLink()).toEqual({ kind: "buddy-read", buddyReadId: READ_ID });
	});
});
