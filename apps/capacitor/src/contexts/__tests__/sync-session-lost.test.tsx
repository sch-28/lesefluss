import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../test/render";

const toastError = vi.hoisted(() => vi.fn());
const listeners = vi.hoisted(() => new Set<() => void>());

vi.mock("@capacitor/app", () => ({
	App: {
		addListener: () => Promise.resolve({ remove: () => Promise.resolve() }),
		getLaunchUrl: () => Promise.resolve(undefined),
	},
}));
vi.mock("@capacitor/browser", () => ({ Browser: {} }));
vi.mock("@capacitor/network", () => ({
	Network: { addListener: () => Promise.resolve({ remove: () => Promise.resolve() }) },
}));
vi.mock("../../components/toast", () => ({
	toast: { error: toastError, success: vi.fn(), warning: vi.fn() },
}));
vi.mock("../../services/book-series-backfill", () => ({ startSeriesBackfill: vi.fn() }));
vi.mock("../../services/push", () => ({ syncPushRegistration: vi.fn() }));
vi.mock("../../services/series-collections", () => ({ startSeriesReconcile: vi.fn() }));
vi.mock("../../services/social/cache", () => ({ invalidateAfterSync: vi.fn() }));
vi.mock("../../services/sync", () => ({
	adoptSyncIdentity: vi.fn(() => Promise.resolve()),
	consumeAuthLoginHandoffState: vi.fn(),
	finalizeVerifiedAuthLoginHandoff: vi.fn(),
	fullSync: vi.fn(() => Promise.resolve()),
	getCloudStorage: vi.fn(),
	getLastSynced: vi.fn(),
	getToken: vi.fn(),
	getUserEmail: vi.fn(),
	IS_WEB_BUILD: true,
	loadServerClockOffset: vi.fn(() => Promise.resolve()),
	NATIVE_SYNC_ENABLED: false,
	notBackedUpMessage: vi.fn(),
	onBooksNotBackedUp: () => () => {},
	onSessionLost: (listener: () => void) => {
		listeners.add(listener);
		return () => listeners.delete(listener);
	},
	signInWithPassword: vi.fn(),
	retryPendingSignOut: vi.fn(),
	SYNC_ENABLED: true,
	syncedWithBlockedMessage: vi.fn(),
	signOut: vi.fn(),
}));

const { SyncProvider } = await import("../sync-context");

function serveSession(user: { email: string } | null) {
	vi.stubGlobal(
		"fetch",
		vi.fn(() => Promise.resolve(new Response(JSON.stringify(user ? { user } : null)))),
	);
}

async function loseSession() {
	await act(async () => {
		for (const listener of listeners) listener();
	});
}

let view: Rendered | null = null;
afterEach(() => {
	view?.unmount();
	view = null;
	toastError.mockClear();
	vi.unstubAllGlobals();
});

describe("SyncProvider when a request answers 401", () => {
	it("says nothing to a web user who was never signed in", async () => {
		serveSession(null);
		view = await render(<SyncProvider>{null}</SyncProvider>);
		await loseSession();
		expect(toastError).not.toHaveBeenCalled();
	});

	it("tells a signed-in user the session expired", async () => {
		serveSession({ email: "a@b.c" });
		view = await render(<SyncProvider>{null}</SyncProvider>);
		await act(async () => {});
		await loseSession();
		expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/session expired/));
		toastError.mockClear();
		await loseSession();
		expect(toastError).not.toHaveBeenCalled();
	});
});
