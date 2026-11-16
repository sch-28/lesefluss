import type { DiscussionComment, DiscussionReply } from "@lesefluss/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../test/render";

const idle = { mutate: vi.fn(), isPending: false };
vi.mock("@/services/social/buddy-read-discussion", () => ({
	discussionFailureMessage: () => "error",
	useDeleteComment: () => idle,
	useEditComment: () => idle,
	useReact: () => idle,
	useReplyToComment: () => idle,
	useUnshareHighlight: () => idle,
}));

const { DiscussionItemCard } = await import("../discussion-item");

const ada = { userId: "u1", handle: "ada", name: "Ada", avatarUrl: null };
const base = { isOwn: false, startWord: 0, endWord: 10, createdAt: Date.now(), reactions: [] };
const reply = (over: Partial<DiscussionReply> = {}): DiscussionReply => ({
	...base,
	id: "r1",
	author: ada,
	body: "A reply",
	editedAt: null,
	removed: false,
	...over,
});
const comment = (over: Partial<DiscussionComment> = {}): DiscussionComment => ({
	...base,
	id: "c1",
	kind: "comment",
	anchorKind: "chapter",
	startCharInWord: 0,
	endCharInWord: 0,
	author: ada,
	body: "A comment",
	editedAt: null,
	removed: false,
	replies: [],
	...over,
});

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

const renderItem = async (item: DiscussionComment) => {
	view = await render(
		<DiscussionItemCard item={item} buddyReadId="br1" isOffline={false} onReport={vi.fn()} />,
	);
	return view;
};

describe("removed comment", () => {
	it("is one muted line without author, reactions or menu, its replies kept", async () => {
		const v = await renderItem(
			comment({ removed: true, author: null, body: null, replies: [reply()] }),
		);
		const article = v.container.querySelector("article");
		expect(article?.firstElementChild?.textContent).toBe("This comment was removed.");
		expect(v.text()).not.toContain("Removed");
		expect(v.text()).toContain("A reply");
		// The only menu and reaction controls left are the reply's own.
		expect(v.container.querySelectorAll('[aria-label="More"]')).toHaveLength(1);
		expect(v.container.querySelectorAll('[aria-label="Add reaction"]')).toHaveLength(1);
	});

	it("draws a removed reply the same way", async () => {
		const v = await renderItem(
			comment({ replies: [reply({ removed: true, author: null, body: null })] }),
		);
		expect(v.text()).toContain("This comment was removed.");
		expect(v.container.querySelectorAll('[aria-label="More"]')).toHaveLength(1);
		expect(v.container.querySelectorAll('[aria-label="Add reaction"]')).toHaveLength(1);
	});

	it("leaves a live comment with its author, menu and reactions", async () => {
		const v = await renderItem(comment());
		expect(v.text()).toContain("Ada");
		expect(v.text()).toContain("A comment");
		expect(v.queryButton("More")).not.toBeNull();
		expect(v.queryButton("Add reaction")).not.toBeNull();
	});
});
