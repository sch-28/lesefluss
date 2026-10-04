import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../test/render";

const state = vi.hoisted(() => ({
	invite: {} as Record<string, unknown>,
	isOnline: true,
	create: vi.fn(),
}));

vi.mock("@/components/app-shell/page-header", () => ({ PageHeader: () => null }));
vi.mock("@/components/social/paste-invite-field", () => ({ PasteInviteField: () => null }));
vi.mock("../social-gate", () => ({
	SocialGate: ({ children }: { children: React.ReactNode }) => children,
	Spinner: () => null,
	OfflineNotice: () => null,
}));
vi.mock("@/services/social/cache", () => ({ useIsOnline: () => state.isOnline }));
vi.mock("@/services/social/friends", () => ({
	socialErrorMessage: () => "error",
	useCurrentInvite: () => state.invite,
	useCreateInvite: () => ({ mutate: state.create, isPending: false }),
	useRevokeInvite: () => ({ mutate: vi.fn(), isPending: false }),
}));

const fresh = {
	isPending: false,
	isError: false,
	isFetchedAfterMount: true,
	isFetching: false,
	data: null,
};
const existing = { url: "https://x/invite/t", expiresAt: 0 };

/** A fresh module per test, so the once-per-session flag starts unset. */
let InviteLinkPage: () => React.ReactElement;
beforeEach(async () => {
	vi.resetModules();
	InviteLinkPage = (await import("../invite-link")).default;
	state.isOnline = true;
});

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	state.create.mockReset();
});

describe("InviteLinkPage", () => {
	it("creates the first link without another tap", async () => {
		state.invite = fresh;
		view = await render(<InviteLinkPage />);

		expect(state.create).toHaveBeenCalledTimes(1);
	});

	it("keeps an existing link", async () => {
		state.invite = { ...fresh, data: existing };
		view = await render(<InviteLinkPage />);

		expect(state.create).not.toHaveBeenCalled();
	});

	it("waits for the server instead of trusting a cached empty answer", async () => {
		state.invite = { ...fresh, isFetchedAfterMount: false, isFetching: true };
		view = await render(<InviteLinkPage />);

		expect(state.create).not.toHaveBeenCalled();
	});

	it("never treats a failed refetch as having no link", async () => {
		state.invite = { ...fresh, isError: true };
		view = await render(<InviteLinkPage />);

		expect(state.create).not.toHaveBeenCalled();
	});

	it("waits until online", async () => {
		state.isOnline = false;
		state.invite = fresh;
		view = await render(<InviteLinkPage />);
		expect(state.create).not.toHaveBeenCalled();

		state.isOnline = true;
		await view.rerender(<InviteLinkPage />);
		expect(state.create).toHaveBeenCalledTimes(1);
	});

	it("leaves a revoked link revoked, also after leaving and coming back", async () => {
		state.invite = fresh;
		view = await render(<InviteLinkPage />);
		expect(state.create).toHaveBeenCalledTimes(1);

		state.invite = { ...fresh, isFetching: true };
		await view.rerender(<InviteLinkPage />);
		state.invite = fresh;
		await view.rerender(<InviteLinkPage />);
		view.unmount();
		view = await render(<InviteLinkPage />);

		expect(state.create).toHaveBeenCalledTimes(1);
	});
});
