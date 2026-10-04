// @vitest-environment node
import { randomUUID } from "node:crypto";
import { BUDDY_COMMENT_RATE_LIMIT, BUDDY_REACTION_RATE_LIMIT } from "@lesefluss/core";
import { describe, expect, test, vi } from "vitest";
import { Route as CommentRoute } from "~/routes/api/social/buddy-read-comment";
import { Route as EditRoute } from "~/routes/api/social/buddy-read-comment-edit";
import { Route as ReplyRoute } from "~/routes/api/social/buddy-read-comment-reply";
import { Route as ReactionRoute } from "~/routes/api/social/buddy-read-reaction";

// The real routes, factory and limiter; only auth and the database work are stubbed.
vi.mock("~/lib/session-middleware", () => ({ requireAuth: {} }));
vi.mock("~/lib/cors-middleware", () => ({ cors: {} }));
vi.mock("~/lib/social/buddy-read-discussion", () => ({
	postComment: vi.fn(async () => ({ commentId: "c" })),
	replyToComment: vi.fn(async () => ({ commentId: "r" })),
	editComment: vi.fn(async () => {}),
	addReaction: vi.fn(async () => {}),
}));

type Handler = (ctx: {
	request: Request;
	context: { user: { id: string }; session: { id: string } };
}) => Promise<Response>;

function postHandler(route: { options: unknown }): Handler {
	return (route.options as { server: { handlers: { POST: Handler } } }).server.handlers.POST;
}

const comment = postHandler(CommentRoute);
const reply = postHandler(ReplyRoute);
const edit = postHandler(EditRoute);
const reaction = postHandler(ReactionRoute);

const bodies = {
	comment: { buddyReadId: randomUUID(), anchor: { kind: "chapter", startWord: 0 }, body: "hi" },
	reply: { parentId: randomUUID(), body: "hi" },
	edit: { commentId: randomUUID(), body: "hi" },
	reaction: { commentId: randomUUID(), emoji: "👍" },
};

function call(handler: Handler, body: unknown, userId: string) {
	const request = new Request("https://lesefluss.test/api", {
		method: "POST",
		body: JSON.stringify(body),
	});
	return handler({ request, context: { user: { id: userId }, session: { id: `sess-${userId}` } } });
}

async function spend(handler: Handler, body: unknown, userId: string, times: number) {
	for (let i = 0; i < times; i++) {
		const res = await call(handler, body, userId);
		if (res.status !== 200) throw new Error(`call ${i + 1} answered ${res.status}`);
	}
}

async function expectLimited(res: Response) {
	expect(res.status).toBe(429);
	expect(await res.json()).toEqual({ error: "Too many requests", reason: "rate_limited" });
}

describe("buddy-read discussion rate limits", () => {
	test("the comment after the limit is refused with rate_limited", async () => {
		const userId = `rl-${randomUUID()}`;
		await spend(comment, bodies.comment, userId, BUDDY_COMMENT_RATE_LIMIT.max);
		await expectLimited(await call(comment, bodies.comment, userId));
		expect((await call(comment, bodies.comment, `rl-${randomUUID()}`)).status).toBe(200);
	});

	test("replies and edits draw on the same comment budget", async () => {
		const userId = `rl-${randomUUID()}`;
		await spend(reply, bodies.reply, userId, BUDDY_COMMENT_RATE_LIMIT.max - 1);
		await spend(edit, bodies.edit, userId, 1);
		await expectLimited(await call(comment, bodies.comment, userId));
		await expectLimited(await call(reply, bodies.reply, userId));
		await expectLimited(await call(edit, bodies.edit, userId));
	});

	test("the reaction after the limit is refused, and reactions and comments are counted apart", async () => {
		const userId = `rl-${randomUUID()}`;
		await spend(reaction, bodies.reaction, userId, BUDDY_REACTION_RATE_LIMIT.max);
		await expectLimited(await call(reaction, bodies.reaction, userId));
		expect((await call(comment, bodies.comment, userId)).status).toBe(200);

		const commenter = `rl-${randomUUID()}`;
		await spend(comment, bodies.comment, commenter, BUDDY_COMMENT_RATE_LIMIT.max);
		expect((await call(reaction, bodies.reaction, commenter)).status).toBe(200);
	});
});
