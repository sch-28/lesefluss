import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../test/render";

const sync = vi.hoisted(() => ({ enabled: true }));

vi.mock("@tanstack/react-router", () => ({
	useLocation: () => ({ pathname: "/tabs/library" }),
	Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
		<a href={to} {...rest}>
			{children}
		</a>
	),
}));
vi.mock("../../../contexts/sync-context", () => ({
	useSyncContext: () => ({ isLoggedIn: false, isSessionResolved: true }),
}));
vi.mock("../../../services/social/cache", () => ({ useRefetchSocialOnForeground: () => {} }));
vi.mock("../../../services/social/inbox", () => ({ useUnreadCount: () => ({ data: undefined }) }));
vi.mock("../../../services/social/profile", () => ({
	useOwnSocialProfile: () => ({ isPending: true }),
}));
vi.mock("../../../services/sync", () => ({
	get SYNC_ENABLED() {
		return sync.enabled;
	},
	IS_WEB_BUILD: false,
	openBrowserSignIn: vi.fn(),
	webSignInHref: (path: string) => path,
}));
vi.mock("../../../pages/social/first-run-hero", () => ({
	TrailerCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const { TabBar } = await import("../TabBar");
const { SocialGate } = await import("../../../pages/social/social-gate");

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	sync.enabled = true;
});

const tabLabels = () =>
	[...(view?.container.querySelectorAll("nav a") ?? [])].map((a) => a.textContent);

describe("Social while signed out", () => {
	it("keeps the Social tab in the tab bar", async () => {
		view = await render(<TabBar />);
		expect(tabLabels()).toEqual(["Library", "Stats", "Explore", "Social", "Settings"]);
	});

	it("drops the Social tab in a build without sync", async () => {
		sync.enabled = false;
		view = await render(<TabBar />);
		expect(tabLabels()).not.toContain("Social");
	});

	it("shows the sign-in pitch on the Social screen", async () => {
		view = await render(
			<SocialGate returnTo="/tabs/social">
				<div>feed</div>
			</SocialGate>,
		);
		expect(view.text()).toContain("Reading is better with company.");
		expect(view.queryButton("Sign in to get started")).not.toBeNull();
		expect(view.text()).not.toContain("feed");
	});
});
