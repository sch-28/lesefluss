import type { SocialRelationships } from "@lesefluss/core";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../test/render";

const state = vi.hoisted(() => ({ friends: [] as SocialRelationships["friends"] }));

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		to,
		params,
		...rest
	}: React.ComponentProps<"a"> & { to: string; params?: { userId?: string } }) => (
		<a href={params?.userId ? to.replace("$userId", params.userId) : to} {...rest}>
			{children}
		</a>
	),
}));
vi.mock("../../../components/app-shell/page-header", () => ({
	PageHeader: ({ title, right }: { title: string; right?: React.ReactNode }) => (
		<header>
			<h1>{title}</h1>
			{right}
		</header>
	),
}));
vi.mock("../social-gate", () => ({
	SocialGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	Spinner: () => null,
	OfflineNotice: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));
vi.mock("../../../services/social/friends", () => ({
	useRelationships: () => ({
		data: { friends: state.friends, incoming: [], outgoing: [], blocked: [] },
		isPending: false,
		isError: false,
	}),
}));

const { default: FriendsPage } = await import("../friends");

const friend = (
	userId: string,
	name: string,
	nowReading?: { title: string; progressPercent: number },
): SocialRelationships["friends"][number] => ({
	userId,
	handle: name.toLowerCase(),
	name,
	avatarUrl: null,
	since: 0,
	nowReading: nowReading ? { key: "k", author: null, cover: null, ...nowReading } : null,
});

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

describe("FriendsPage", () => {
	it("lists every friend, each opening their profile", async () => {
		state.friends = Array.from({ length: 12 }, (_, i) => friend(`u${i}`, `Friend${i}`));
		state.friends[0] = friend("u0", "Ada", { title: "Dune", progressPercent: 42 });
		view = await render(<FriendsPage />);
		const links = [...view.container.querySelectorAll('a[href^="/tabs/social/profile/"]')];
		expect(links).toHaveLength(12);
		expect(links[0]?.getAttribute("href")).toBe("/tabs/social/profile/u0");
		expect(view.text()).toContain("12 friends");
		expect(view.text()).toContain("@ada · Dune, 42%");
	});

	it("says so when there are none", async () => {
		state.friends = [];
		view = await render(<FriendsPage />);
		expect(view.text()).toContain("No friends yet");
	});
});
