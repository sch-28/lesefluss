import { DEVICE_LINK_CLIENT_ID, DEVICE_LINK_GRANT_TYPE } from "@lesefluss/core";
import { SYNC_URL } from "./auth-client";
import { SIGN_IN_FAILED_MESSAGE } from "./sign-in-copy";

export type DeviceSignInFailure = "expired" | "denied" | "offline" | "unknown";

export class DeviceSignInError extends Error {
	constructor(readonly reason: DeviceSignInFailure) {
		super(deviceSignInMessage(reason));
		this.name = "DeviceSignInError";
	}
}

function deviceSignInMessage(reason: DeviceSignInFailure): string {
	switch (reason) {
		case "expired":
			return "This code has expired. Get a new one to try again.";
		case "denied":
			return "Sign-in was denied on the other device.";
		case "offline":
			return "Can't reach the server. Check your connection and try again.";
		case "unknown":
			return SIGN_IN_FAILED_MESSAGE;
	}
}

export type DeviceCodeGrant = {
	/** The app's secret for this attempt; never shown, only sent back when polling. */
	deviceCode: string;
	/** What the user reads or scans; unformatted. */
	userCode: string;
	/** Website page with the code prefilled, for the QR. */
	verificationUrl: string;
	expiresAt: number;
	intervalMs: number;
};

export type DevicePollResult =
	| { status: "pending" }
	| { status: "slow-down" }
	| { status: "approved"; token: string };

async function postJson(path: string, body: Record<string, string>): Promise<Response> {
	try {
		return await fetch(`${SYNC_URL}${path}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
	} catch {
		throw new DeviceSignInError("offline");
	}
}

function readJsonField(body: unknown, key: string): unknown {
	return typeof body === "object" && body !== null
		? (body as Record<string, unknown>)[key]
		: undefined;
}

export async function requestDeviceCode(now = Date.now()): Promise<DeviceCodeGrant> {
	const res = await postJson("/api/auth/device/code", { client_id: DEVICE_LINK_CLIENT_ID });
	const body: unknown = await res.json().catch(() => null);
	const deviceCode = readJsonField(body, "device_code");
	const userCode = readJsonField(body, "user_code");
	const verificationUrl = readJsonField(body, "verification_uri_complete");
	const expiresIn = readJsonField(body, "expires_in");
	const interval = readJsonField(body, "interval");
	if (
		!res.ok ||
		typeof deviceCode !== "string" ||
		typeof userCode !== "string" ||
		typeof verificationUrl !== "string" ||
		typeof expiresIn !== "number" ||
		typeof interval !== "number"
	) {
		throw new DeviceSignInError("unknown");
	}
	return {
		deviceCode,
		userCode,
		verificationUrl,
		expiresAt: now + expiresIn * 1000,
		intervalMs: interval * 1000,
	};
}

export async function pollDeviceToken(deviceCode: string): Promise<DevicePollResult> {
	const res = await postJson("/api/auth/device/token", {
		grant_type: DEVICE_LINK_GRANT_TYPE,
		device_code: deviceCode,
		client_id: DEVICE_LINK_CLIENT_ID,
	});
	const body: unknown = await res.json().catch(() => null);
	if (res.ok) {
		const token = readJsonField(body, "access_token");
		if (typeof token === "string" && token !== "") return { status: "approved", token };
		throw new DeviceSignInError("unknown");
	}
	// A rate-limited poll carries no OAuth error code; treat it like slow_down.
	if (res.status === 429) return { status: "slow-down" };
	switch (readJsonField(body, "error")) {
		case "authorization_pending":
			return { status: "pending" };
		case "slow_down":
			return { status: "slow-down" };
		case "expired_token":
			throw new DeviceSignInError("expired");
		case "access_denied":
			throw new DeviceSignInError("denied");
		default:
			throw new DeviceSignInError("unknown");
	}
}
