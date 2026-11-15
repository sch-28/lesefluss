import type { InvitePreview } from "@lesefluss/core";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@tanstack/react-start", () => {
	const builder = (validate: (d: unknown) => unknown = (d) => d) => ({
		inputValidator: (v: (d: unknown) => unknown) => builder(v),
		handler:
			(fn: (ctx: { data: unknown }) => unknown) =>
			(opts: { data?: unknown } = {}) =>
				fn({ data: validate(opts.data) }),
	});
	return { createServerFn: () => builder() };
});
vi.mock("@tanstack/react-start/server", () => ({
	getRequest: () => new Request("https://lesefluss.test/invite/tok"),
}));
const session = vi.hoisted(() => ({ current: null as { user: { id: string } } | null }));
vi.mock("./auth", () => ({ auth: { api: { getSession: async () => session.current } } }));
vi.mock("~/db", () => ({ db: {} }));
const preview = vi.hoisted(() => vi.fn());
vi.mock("./social/invite", () => ({ previewInvite: preview }));

const { previewInviteForPage } = await import("./invite-page");

const OWNED: InvitePreview = {
	state: "signed_out",
	owner: { userId: "u-owner", handle: "ada", name: "Ada", avatarUrl: null },
};

describe("invite page server function", () => {
	beforeEach(() => preview.mockResolvedValue(OWNED));

	test("sends a signed-out visitor only the owner's handle, name and avatar", async () => {
		session.current = null;
		const reply = await previewInviteForPage({ data: { token: "tok" } });
		expect(reply).toEqual({
			state: "signed_out",
			owner: { handle: "ada", name: "Ada", avatarUrl: null },
		});
		expect(preview).toHaveBeenCalledWith({}, null, "tok");
	});

	test("keeps the owner's user id for a signed-in viewer", async () => {
		session.current = { user: { id: "u-viewer" } };
		const reply = await previewInviteForPage({ data: { token: "tok" } });
		expect(reply).toEqual(OWNED);
	});
});
