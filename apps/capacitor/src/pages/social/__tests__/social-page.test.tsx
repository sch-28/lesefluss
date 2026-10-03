import type { OwnSocialProfile, SocialRelationships } from "@lesefluss/core";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../test/render";

const state = vi.hoisted(() => ({
	relationships: undefined as SocialRelationships | undefined,
	unread: 0,
	buddyReads: [] as unknown[],
}));

const me: OwnSocialProfile = {
	userId: "me",
	handle: "ada",
	handleChangedAt: null,
	name: "Ada",
	bio: null,
	avatarUrl: null,
	hasAccountPicture: false,
	visibility: "friends",
	showCurrentlyReading: true,
	showFinished: true,
	showStats: true,
	showHighlights: true,
	feedEnabled: true,
	shareLiveReading: true,
	timeZone: null,
};

const idle = { mutate: vi.fn(), isPending: false };

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		to,
		params,
		...rest
	}: React.ComponentProps<"a"> & { to: string; params?: unknown }) => (
		<a href={to} {...rest}>
			{children}
		</a>
	),
	useRouter: () => ({ navigate: vi.fn() }),
	useNavigate: () => vi.fn(),
}));
vi.mock("../../../contexts/sync-context", () => ({
	useSyncContext: () => ({ isLoggedIn: true, isSessionResolved: true }),
}));
vi.mock("../../../services/deep-links/use-deep-links", () => ({ replayPendingLink: vi.fn() }));
vi.mock("../../../services/social/profile", () => ({
	useOwnSocialProfile: () => ({ data: me, isPending: false, isError: false }),
}));
vi.mock("../../../services/social/cache", () => ({ useIsOnline: () => true }));
vi.mock("../../../services/social/inbox", () => ({
	useUnreadCount: () => ({ data: { count: state.unread } }),
}));
vi.mock("../../../services/social/friends", () => ({
	socialErrorMessage: () => "error",
	useRelationships: () => ({ data: state.relationships, isPending: false, isError: false }),
	useRespondToRequest: () => idle,
	useCancelRequest: () => idle,
}));
vi.mock("../../../services/social/buddy-reads", () => ({
	useBuddyReads: () => ({ data: state.buddyReads, isPending: false, isError: false }),
	paceText: () => "",
}));
vi.mock("../../../services/social/feed", () => ({
	useFeed: () => ({ data: { pages: [{ items: [] }] }, isPending: false, isError: false }),
	useDeleteFeedEvent: () => idle,
}));
vi.mock("../../../services/db/hooks", () => ({
	queryHooks: {
		useStatsCurrentlyReading: () => ({ data: [] }),
		useStatsStreak: () => ({ data: { current: 4 } }),
		useBooks: () => ({ data: undefined }),
		useBook: () => ({ data: undefined }),
	},
}));
vi.mock("../../../components/social/start-buddy-read-picker", () => ({
	StartBuddyReadPicker: () => null,
}));

const { default: SocialPage } = await import("../index");

const person = (userId: string, name: string) => ({
	userId,
	handle: name.toLowerCase(),
	name,
	avatarUrl: null,
});

function relationships(overrides: Partial<SocialRelationships>): SocialRelationships {
	return { friends: [], incoming: [], outgoing: [], blocked: [], ...overrides };
}

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	state.buddyReads = [];
});

const headings = () =>
	[...(view?.container.querySelectorAll("h2") ?? [])].map((h) => h.textContent);

describe("SocialPage", () => {
	it("shows one first-run hero instead of empty sections while there are no friends", async () => {
		state.relationships = relationships({
			outgoing: [{ ...person("b", "Bea"), requestId: "r1", sentAt: 0 }],
		});
		view = await render(<SocialPage />);

		expect(view.text()).toContain("Read together, wherever you are.");
		expect(view.text()).toContain("Invite a reading buddy");
		expect(view.text()).toContain("Bea hasn't accepted yet");
		expect(
			view.container.querySelector('input[aria-label="Invite link you received"]'),
		).not.toBeNull();
		expect(headings()).not.toContain("Buddy reads");
		expect(headings()).not.toContain("Friends");
		expect(headings()).not.toContain("Activity");
	});

	it("keeps buddy reads reachable for someone whose friends are gone", async () => {
		state.relationships = relationships({});
		state.buddyReads = [{ id: "br1", status: "finished", members: [] }];
		view = await render(<SocialPage />);

		expect(view.text()).toContain("Read together, wherever you are.");
		expect(headings()).toContain("Buddy reads");
		expect(view.container.querySelector('a[href="/tabs/social/buddy-reads"]')).not.toBeNull();
	});

	it("puts an incoming request above the first-run hero", async () => {
		state.relationships = relationships({
			incoming: [{ ...person("c", "Cy"), requestId: "r2", sentAt: 0 }],
		});
		view = await render(<SocialPage />);

		const text = view.text();
		expect(text.indexOf("Cy wants to be friends")).toBeLessThan(text.indexOf("Read together"));
		expect(view.getButton("Accept")).toBeTruthy();
		expect(view.getButton("Decline")).toBeTruthy();
	});

	it("shows the profile hero, friends with what they read and activity once there are friends", async () => {
		state.unread = 3;
		state.relationships = relationships({
			friends: [
				{
					...person("b", "Bea"),
					since: 0,
					nowReading: {
						key: "k",
						title: "Morning Star",
						author: null,
						progressPercent: 62,
						cover: null,
					},
				},
				{ ...person("d", "Dee"), since: 0, nowReading: null },
			],
		});
		view = await render(<SocialPage />);

		expect(view.text()).not.toContain("Read together");
		expect(view.text()).toContain("@ada · Your profile");
		expect(view.text()).toContain("Day streak");
		expect(headings()).toEqual(expect.arrayContaining(["Buddy reads", "Friends", "Activity"]));
		expect(
			view.container.querySelector('a[aria-label="Bea, reading Morning Star, 62%"]'),
		).not.toBeNull();
		expect(view.text()).toContain("@dee");
		expect(view.container.querySelector('a[aria-label="Inbox, 3 unread"]')).not.toBeNull();
	});
});
