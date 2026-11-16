import { randomUUID } from "node:crypto";
import type { InvitePreview } from "@lesefluss/core";
import { describe, expect, test, vi } from "vitest";
import { previewForViewer, signedOutInvitePreview } from "./signed-out-invite-preview";

const OWNER = { userId: "u-owner", handle: "ada", name: "Ada", avatarUrl: null };

function post(body: unknown, ip: string = randomUUID()) {
	return new Request("https://lesefluss.test/api/social/invite-preview-signed-out", {
		method: "POST",
		headers: { "cf-connecting-ip": ip, cookie: "better-auth.session_token=x" },
		body: typeof body === "string" ? body : JSON.stringify(body),
	});
}

describe("signed-out invite preview", () => {
	test("answers the preview for the posted token", async () => {
		const preview = vi.fn(
			async (): Promise<InvitePreview> => ({ state: "signed_out", owner: OWNER }),
		);
		const res = await signedOutInvitePreview(preview)({ request: post({ token: "tok" }) });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			state: "signed_out",
			owner: { handle: "ada", name: "Ada", avatarUrl: null },
		});
		expect(preview).toHaveBeenCalledWith("tok");
	});

	test("never passes on the owner's user id or any field beyond name, handle and avatar", async () => {
		const leaky = { ...OWNER, email: "ada@example.com", books: [{ title: "Secret" }] };
		const preview = vi.fn(async () => ({ state: "signed_out", owner: leaky }) as InvitePreview);
		const res = await signedOutInvitePreview(preview)({ request: post({ token: "tok" }) });
		const body = await res.json();
		expect(Object.keys(body.owner).sort()).toEqual(["avatarUrl", "handle", "name"]);
		expect(JSON.stringify(body)).not.toMatch(/u-owner|ada@example|Secret/);
	});

	test("answers an invalid link without an owner", async () => {
		const preview = vi.fn(async (): Promise<InvitePreview> => ({ state: "invalid" }));
		const res = await signedOutInvitePreview(preview)({ request: post({ token: "tok" }) });
		expect(await res.json()).toEqual({ state: "invalid" });
	});

	test("rejects a missing, empty or non-JSON token with 400 and never looks it up", async () => {
		const preview = vi.fn();
		const handler = signedOutInvitePreview(preview);
		for (const body of [{}, { token: "" }, { token: "x".repeat(201) }, "not json"]) {
			expect((await handler({ request: post(body) })).status).toBe(400);
		}
		expect(preview).not.toHaveBeenCalled();
	});

	test("limits each client address on its own", async () => {
		const preview = vi.fn(async (): Promise<InvitePreview> => ({ state: "invalid" }));
		const handler = signedOutInvitePreview(preview);
		const ip = randomUUID();
		for (let i = 0; i < 120; i++) await handler({ request: post({ token: "t" }, ip) });

		expect((await handler({ request: post({ token: "t" }, ip) })).status).toBe(429);
		expect((await handler({ request: post({ token: "t" }) })).status).toBe(200);
	});
});

describe("invite page preview for a viewer", () => {
	test("gives a signed-out visitor only the owner's handle, name and avatar", () => {
		const body = previewForViewer(null, { state: "signed_out", owner: OWNER });
		expect(body).toEqual({
			state: "signed_out",
			owner: { handle: "ada", name: "Ada", avatarUrl: null },
		});
		expect(JSON.stringify(body)).not.toContain("u-owner");
	});

	test("leaves a signed-in viewer's preview whole", () => {
		const preview: InvitePreview = { state: "valid", owner: OWNER };
		expect(previewForViewer("u-viewer", preview)).toBe(preview);
	});
});
