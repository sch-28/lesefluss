// @vitest-environment node
import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createFcmSender, type PushMessage } from "./fcm";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const account = {
	project_id: "test",
	client_email: "push@test.iam.gserviceaccount.com",
	private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
	token_uri: "https://oauth2.test/token",
};
const message: PushMessage = {
	title: "bob",
	body: "Accepted your friend request",
	tag: "friend_request_accepted:x",
	data: { route: "/tabs/social/inbox", inboxItemId: "x" },
};

function answerSendWith(status: number, body: unknown) {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string) =>
			url === account.token_uri
				? Response.json({ access_token: "at", expires_in: 3600 })
				: Response.json(body, { status }),
		),
	);
}

describe("FCM sender", () => {
	beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
	afterEach(() => vi.unstubAllGlobals());

	test("only an error that names the token condemns it", async () => {
		const send = createFcmSender(account);
		answerSendWith(404, { error: { status: "NOT_FOUND" } });
		expect(await send("t", "android", message)).toBe("invalid_token");
		answerSendWith(404, { error: { status: "UNREGISTERED" } });
		expect(await send("t", "android", message)).toBe("invalid_token");
		answerSendWith(400, {
			error: {
				status: "INVALID_ARGUMENT",
				details: [{ fieldViolations: [{ field: "message.token" }] }],
			},
		});
		expect(await send("t", "android", message)).toBe("invalid_token");
	});

	test("a rejected payload fails the send but keeps the token", async () => {
		const send = createFcmSender(account);
		answerSendWith(400, {
			error: {
				status: "INVALID_ARGUMENT",
				details: [{ fieldViolations: [{ field: "message.notification.title" }] }],
			},
		});
		expect(await send("t", "android", message)).toBe("failed");
	});

	test("a network error is a failed send, not a throw", async () => {
		const send = createFcmSender(account);
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new TypeError("fetch failed");
			}),
		);
		expect(await send("t", "android", message)).toBe("failed");
	});
});
