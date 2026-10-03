import { DEVICE_LINK_GRANT_TYPE } from "@lesefluss/core";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../auth-client", () => ({
	SYNC_URL: "https://lesefluss.app",
	syncAuthClient: null,
}));

import { DeviceSignInError, pollDeviceToken, requestDeviceCode } from "../device-sign-in";

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
		if (err instanceof DeviceSignInError) return err.reason;
		throw err;
	}
	throw new Error("expected the call to fail");
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("requestDeviceCode", () => {
	it("asks for a code as the app client and keeps what the screen needs", async () => {
		const fetchMock = respond(200, {
			device_code: "secret-device-code",
			user_code: "ABCD2345",
			verification_uri: "https://lesefluss.app/link",
			verification_uri_complete: "https://lesefluss.app/link?user_code=ABCD2345",
			expires_in: 600,
			interval: 3,
		});
		vi.stubGlobal("fetch", fetchMock);

		await expect(requestDeviceCode(1_000)).resolves.toEqual({
			deviceCode: "secret-device-code",
			userCode: "ABCD2345",
			verificationUrl: "https://lesefluss.app/link?user_code=ABCD2345",
			expiresAt: 601_000,
			intervalMs: 3_000,
		});
		expect(fetchMock).toHaveBeenCalledWith("https://lesefluss.app/api/auth/device/code", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ client_id: "lesefluss-app" }),
		});
	});

	it("fails as unknown when the response is not a grant", async () => {
		vi.stubGlobal("fetch", respond(200, { user_code: "ABCD2345" }));
		expect(await failureOf(requestDeviceCode())).toBe("unknown");
	});

	it("fails as offline when the request cannot be made", async () => {
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
		expect(await failureOf(requestDeviceCode())).toBe("offline");
	});
});

describe("pollDeviceToken", () => {
	it("sends the device code grant and returns the session token once approved", async () => {
		const fetchMock = respond(200, { access_token: "session-token", token_type: "Bearer" });
		vi.stubGlobal("fetch", fetchMock);

		await expect(pollDeviceToken("secret-device-code")).resolves.toEqual({
			status: "approved",
			token: "session-token",
		});
		expect(fetchMock).toHaveBeenCalledWith("https://lesefluss.app/api/auth/device/token", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				grant_type: DEVICE_LINK_GRANT_TYPE,
				device_code: "secret-device-code",
				client_id: "lesefluss-app",
			}),
		});
	});

	it("reports pending and slow-down without failing", async () => {
		vi.stubGlobal("fetch", respond(400, { error: "authorization_pending" }));
		await expect(pollDeviceToken("dc")).resolves.toEqual({ status: "pending" });
		vi.stubGlobal("fetch", respond(400, { error: "slow_down" }));
		await expect(pollDeviceToken("dc")).resolves.toEqual({ status: "slow-down" });
		vi.stubGlobal("fetch", respond(429, { message: "Too many requests" }));
		await expect(pollDeviceToken("dc")).resolves.toEqual({ status: "slow-down" });
	});

	it("maps the terminal errors", async () => {
		vi.stubGlobal("fetch", respond(400, { error: "expired_token" }));
		expect(await failureOf(pollDeviceToken("dc"))).toBe("expired");
		vi.stubGlobal("fetch", respond(400, { error: "access_denied" }));
		expect(await failureOf(pollDeviceToken("dc"))).toBe("denied");
		vi.stubGlobal("fetch", respond(400, { error: "invalid_grant" }));
		expect(await failureOf(pollDeviceToken("dc"))).toBe("unknown");
		vi.stubGlobal("fetch", respond(200, {}));
		expect(await failureOf(pollDeviceToken("dc"))).toBe("unknown");
	});
});
