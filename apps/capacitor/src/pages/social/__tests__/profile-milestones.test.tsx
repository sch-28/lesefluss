import type { ProfileView } from "@lesefluss/core";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../test/render";

const state = vi.hoisted(() => ({ view: null as unknown }));

vi.mock("@tanstack/react-router", () => ({
	Link: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/app-shell/page-header", () => ({ PageHeader: () => null }));
vi.mock("../social-gate", () => ({
	SocialGate: ({ children }: { children: React.ReactNode }) => children,
	Spinner: () => null,
	OfflineNotice: () => null,
}));
vi.mock("@/services/social/cache", () => ({ useIsOnline: () => true }));
vi.mock("@/services/social/friends", () => ({
	socialErrorMessage: () => "error",
	useRemoveFriend: () => ({ mutate: vi.fn(), isPending: false }),
	useBlockUser: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/services/social/profile-view", () => ({
	useProfileView: () => ({ isPending: false, isError: false, data: state.view }),
}));

const { default: ProfilePage } = await import("../profile");

function profileWith(milestones: ProfileView["sections"]["milestones"]): ProfileView {
	return {
		header: {
			identity: { userId: "u2", handle: "ana", name: "Ana", avatar: null },
			relation: "friend",
			friendsSince: null,
		},
		bio: null,
		friendCount: 1,
		sections: { milestones },
	} as unknown as ProfileView;
}

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

const medals = () => view?.container.querySelectorAll("[data-testid=milestone-medal]") ?? [];

describe("ProfilePage milestones", () => {
	it("shows a friend's reached milestones, RSVP ones badged", async () => {
		state.view = profileWith({
			reached: [
				{ kind: "words", threshold: 1_000_000, reachedAt: Date.UTC(2026, 10, 3, 12) },
				{ kind: "rsvpWpm", threshold: 500, reachedAt: Date.UTC(2026, 9, 1, 12) },
			],
			next: [],
		});
		view = await render(<ProfilePage userId="u2" isPreview={false} />);
		expect(view.text()).toContain("Milestones");
		expect(medals()).toHaveLength(2);
		expect(view.text()).toContain("1M");
		expect(view.container.querySelector("[aria-label=RSVP]")).not.toBeNull();
	});

	it("skips a kind this app version does not know", async () => {
		state.view = profileWith({
			reached: [
				{ kind: "pages" as never, threshold: 10, reachedAt: 0 },
				{ kind: "books", threshold: 5, reachedAt: Date.UTC(2026, 10, 3, 12) },
			],
			next: [],
		});
		view = await render(<ProfilePage userId="u2" isPreview={false} />);
		expect(medals()).toHaveLength(1);
		expect(view.text()).toContain("books");
	});

	it("leaves the section out when the owner hides it", async () => {
		state.view = profileWith(undefined);
		view = await render(<ProfilePage userId="u2" isPreview={false} />);
		expect(view.text()).not.toContain("Milestones");
	});
});
