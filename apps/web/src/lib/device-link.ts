import { isDeviceLinkCode, normalizeDeviceLinkCode } from "@lesefluss/core";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { auth } from "./auth";
import { checkLimit, getClientKey } from "./rate-limit";

export type DeviceLinkState =
	| "approved"
	| "denied"
	| "invalid"
	| "expired"
	| "already-used"
	| "signed-out"
	| "rate-limited";

export type DeviceLinkDecision = "approve" | "deny";

const DecisionInput = z.object({
	code: z.string().min(1).max(200),
	decision: z.enum(["approve", "deny"]),
});

function apiErrorCode(err: unknown): string | null {
	if (!(err instanceof APIError)) throw err;
	const code = err.body?.error;
	return typeof code === "string" ? code : null;
}

// The plugin reports an unknown code and an already decided one alike; a
// status read tells them apart.
async function readDeviceLinkState(code: string, headers: Headers): Promise<DeviceLinkState> {
	try {
		const result = await auth.api.deviceVerify({ query: { user_code: code }, headers });
		return result.status === "pending" ? "invalid" : "already-used";
	} catch (err) {
		return apiErrorCode(err) === "expired_token" ? "expired" : "invalid";
	}
}

export const decideDeviceLink = createServerFn({ method: "POST" })
	.inputValidator((data: unknown) => DecisionInput.parse(data))
	.handler(async ({ data }): Promise<DeviceLinkState> => {
		const request = getRequest();
		// auth.api calls bypass better-auth's own limiter, so the page limits here.
		const { ok } = checkLimit(`device-link:${getClientKey(request)}`, {
			max: 30,
			windowMs: 60_000,
		});
		if (!ok) return "rate-limited";
		const code = normalizeDeviceLinkCode(data.code);
		if (!isDeviceLinkCode(code)) return "invalid";
		try {
			if (data.decision === "approve") {
				await auth.api.deviceApprove({ body: { userCode: code }, headers: request.headers });
				return "approved";
			}
			await auth.api.deviceDeny({ body: { userCode: code }, headers: request.headers });
			return "denied";
		} catch (err) {
			switch (apiErrorCode(err)) {
				case "unauthorized":
					return "signed-out";
				case "expired_token":
					return "expired";
				case "invalid_request":
					return readDeviceLinkState(code, request.headers);
				default:
					return "invalid";
			}
		}
	});
