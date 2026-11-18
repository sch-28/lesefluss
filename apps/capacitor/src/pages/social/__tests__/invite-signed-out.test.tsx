import type { SignedOutInvitePreview } from "@lesefluss/core";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../test/render";

const state = vi.hoisted(() => ({
	preview: { isPending: false, fetchStatus: "idle", data: undefined } as {
		isPending: boolean;
		fetchStatus: string;
		data: SignedOutInvitePreview | undefined;
	},
}));

vi.mock("@tanstack/react-router", () => ({
	Link: ({ children, to, ...rest }: React.ComponentProps<"a"> & { to: string }) => (
		<a href={to} {...rest}>
			{children}
		</a>
	),
	useNavigate: () => vi.fn(),
	useRouter: () => ({ navigate: vi.fn(), history: { back: vi.fn() } }),
}));
vi.mock("../../../components/app-shell/page-header", () => ({ PageHeader: () => null }));
vi.mock("../../../contexts/sync-context", () => ({
	useSyncContext: () => ({ isLoggedIn: false, isSessionResolved: true }),
}));
vi.mock("../../../services/deep-links/pending-link", () => ({
	setPendingLink: vi.fn(),
	clearPendingLink: vi.fn(),
}));
vi.mock("../../../services/social/profile", () => ({
	useOwnSocialProfile: () => ({ isPending: true }),
}));
vi.mock("../../../services/social/cache", () => ({ useIsOnline: () => true }));
vi.mock("../../../services/social/friends", () => ({
	socialErrorMessage: () => "error",
	useInvitePreview: () => ({ isPending: true }),
	useRedeemInvite: () => ({ mutate: vi.fn(), isPending: false }),
	useSignedOutInvitePreview: () => state.preview,
}));
vi.mock("../../../components/social/social-ui", () => ({
	useCurrentBook: () => ({
		id: "b1",
		title: "My Secret Diary",
		coverSrc: "/cover.jpg",
		percent: 30,
	}),
}));
vi.mock("../../../services/sync", () => ({
	IS_WEB_BUILD: true,
	SYNC_ENABLED: true,
	openBrowserSignIn: vi.fn(),
	webSignInHref: (to: string) => to,
}));

const { default: InvitePage } = await import("../invite");

const OWNER = { handle: "jan", name: "Jan", avatarUrl: "/avatars/jan.png" };

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

describe("invite page, signed out", () => {
	it("shows the inviter's name, avatar and handle and none of the device's books", async () => {
		state.preview = {
			isPending: false,
			fetchStatus: "idle",
			data: { state: "signed_out", owner: OWNER },
		};
		view = await render(<InvitePage token="tok" />);

		expect(view.text()).toContain("Jan invited you");
		expect(view.text()).toContain("@jan");
		expect(view.container.querySelector('img[src="/avatars/jan.png"]')).not.toBeNull();
		expect(view.text()).not.toContain("My Secret Diary");
		expect(view.container.querySelector('img[src*="cover.jpg"]')).toBeNull();
	});

	it("falls back to a friend when the inviter can't be loaded", async () => {
		state.preview = { isPending: true, fetchStatus: "idle", data: undefined };
		view = await render(<InvitePage token="tok" />);

		expect(view.text()).toContain("A friend invited you");
		expect(view.text()).not.toContain("My Secret Diary");
	});

	it("says a dead link is no longer valid instead of asking to sign in", async () => {
		state.preview = { isPending: false, fetchStatus: "idle", data: { state: "invalid" } };
		view = await render(<InvitePage token="tok" />);

		expect(view.text()).toContain("This invite link is no longer valid");
		expect(view.queryButton(/Sign in/)).toBeNull();
	});
});
