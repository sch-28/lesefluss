import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../auth-client", () => ({
	SYNC_URL: "https://lesefluss.app",
	syncAuthClient: null,
}));

import { PasswordSignInError, signInWithPassword } from "../password-sign-in";

function respond(status: number, body: unknown) {
	return vi.fn().mockResolvedValue({
		ok: status >= 200 && status < 300,
		status,
		json: async () => body,
	});
}

async function failureOf(promise: Promise<unknown>) {
	try {
		await promise;
	} catch (err) {
		if (err instanceof PasswordSignInError) return err.reason;
		throw err;
	}
	throw new Error("expected sign-in to fail");
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("signInWithPassword", () => {
	it("posts the credentials and returns the session token from the body", async () => {
		const fetchMock = respond(200, { token: "session-token", user: { email: "r@example.com" } });
		vi.stubGlobal("fetch", fetchMock);

		await expect(signInWithPassword("r@example.com", "hunter22")).resolves.toBe("session-token");

		expect(fetchMock).toHaveBeenCalledWith("https://lesefluss.app/api/auth/sign-in/email", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "r@example.com", password: "hunter22" }),
		});
	});

	it("maps a wrong password to invalid-credentials", async () => {
		vi.stubGlobal("fetch", respond(401, { code: "INVALID_EMAIL_OR_PASSWORD" }));
		expect(await failureOf(signInWithPassword("r@example.com", "nope"))).toBe(
			"invalid-credentials",
		);
	});

	it("maps an unverified account to email-not-verified", async () => {
		vi.stubGlobal("fetch", respond(403, { code: "EMAIL_NOT_VERIFIED" }));
		expect(await failureOf(signInWithPassword("r@example.com", "hunter22"))).toBe(
			"email-not-verified",
		);
	});

	it("prefers the error code over the status when both are present", async () => {
		vi.stubGlobal("fetch", respond(400, { code: "EMAIL_NOT_VERIFIED" }));
		expect(await failureOf(signInWithPassword("r@example.com", "hunter22"))).toBe(
			"email-not-verified",
		);
	});

	it("does not read any other 403 as an unverified email", async () => {
		vi.stubGlobal("fetch", respond(403, { code: "INVALID_ORIGIN", message: "Invalid origin" }));
		expect(await failureOf(signInWithPassword("r@example.com", "hunter22"))).toBe("unknown");
	});

	it("maps 429 to rate-limited even without a JSON body", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: false,
				status: 429,
				json: async () => {
					throw new Error("not json");
				},
			}),
		);
		expect(await failureOf(signInWithPassword("r@example.com", "hunter22"))).toBe("rate-limited");
	});

	it("maps a network failure to offline", async () => {
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
		expect(await failureOf(signInWithPassword("r@example.com", "hunter22"))).toBe("offline");
	});

	it("treats a success response without a token as unknown", async () => {
		vi.stubGlobal("fetch", respond(200, { user: { email: "r@example.com" } }));
		expect(await failureOf(signInWithPassword("r@example.com", "hunter22"))).toBe("unknown");
	});
});
