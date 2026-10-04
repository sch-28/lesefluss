import { createSign } from "node:crypto";
import { PUSH_CHANNEL_ID, type PushData, type PushPlatform } from "@lesefluss/core";
import { z } from "zod";

export type PushMessage = {
	title: string;
	body: string;
	/** Same tag, same subject: the device replaces the earlier notification instead of stacking. */
	tag: string;
	data: PushData;
};

export type PushSendResult = "sent" | "invalid_token" | "failed";

export type PushSender = (
	token: string,
	platform: PushPlatform,
	message: PushMessage,
) => Promise<PushSendResult>;

const ServiceAccountSchema = z.object({
	project_id: z.string(),
	client_email: z.string(),
	private_key: z.string(),
	token_uri: z.string(),
});
type ServiceAccount = z.infer<typeof ServiceAccountSchema>;

const AccessTokenSchema = z.object({ access_token: z.string(), expires_in: z.number() });

const FcmErrorSchema = z.object({
	error: z.object({
		status: z.string().optional(),
		details: z
			.array(
				z.object({
					fieldViolations: z.array(z.object({ field: z.string().optional() })).optional(),
				}),
			)
			.optional(),
	}),
});

const CREDENTIAL_ENV = "FIREBASE_SERVICE_ACCOUNT_BASE64";
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const ACCESS_TOKEN_LIFETIME_S = 3600;
const ACCESS_TOKEN_MARGIN_MS = 5 * 60_000;
const REQUEST_TIMEOUT_MS = 10_000;

let parsedCredential: { raw: string; account: ServiceAccount | null } | null = null;

/** Null without the credential, or when it does not parse; either way push stays off. */
export function readServiceAccount(): ServiceAccount | null {
	const raw = process.env[CREDENTIAL_ENV];
	if (!raw) return null;
	if (parsedCredential?.raw !== raw) {
		parsedCredential = { raw, account: parseServiceAccount(raw) };
		if (!parsedCredential.account) {
			console.error(`push: ${CREDENTIAL_ENV} is not a base64 service-account JSON, push is off`);
		}
	}
	return parsedCredential.account;
}

function parseServiceAccount(raw: string): ServiceAccount | null {
	try {
		const parsed = ServiceAccountSchema.safeParse(
			JSON.parse(Buffer.from(raw, "base64").toString()),
		);
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
}

/** Dev and self-hosted setups without Firebase run without push. */
export function isPushConfigured(): boolean {
	return readServiceAccount() !== null;
}

function signedAssertion(account: ServiceAccount, nowS: number): string {
	const encode = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
	const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
		iss: account.client_email,
		scope: FCM_SCOPE,
		aud: account.token_uri,
		iat: nowS,
		exp: nowS + ACCESS_TOKEN_LIFETIME_S,
	})}`;
	const signature = createSign("RSA-SHA256")
		.update(unsigned)
		.sign(account.private_key, "base64url");
	return `${unsigned}.${signature}`;
}

/**
 * FCM also answers INVALID_ARGUMENT for a malformed message, so only an error
 * that names the token field condemns the token; anything else would let one
 * bad payload wipe a recipient's devices.
 */
function blamesToken(httpStatus: number, body: unknown): boolean {
	if (httpStatus === 404) return true;
	const parsed = FcmErrorSchema.safeParse(body);
	if (!parsed.success) return false;
	const { status, details } = parsed.data.error;
	if (status === "UNREGISTERED") return true;
	return (
		status === "INVALID_ARGUMENT" &&
		(details ?? []).some((d) => d.fieldViolations?.some((v) => v.field === "message.token"))
	);
}

/** FCM's HTTP v1 API; it also delivers to iOS once APNs is set up in Firebase. Never throws. */
export function createFcmSender(account: ServiceAccount): PushSender {
	let cached: { token: string; expiresAt: number } | null = null;

	async function accessToken(): Promise<string> {
		if (cached && cached.expiresAt - ACCESS_TOKEN_MARGIN_MS > Date.now()) return cached.token;
		const res = await fetch(account.token_uri, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
				assertion: signedAssertion(account, Math.floor(Date.now() / 1000)),
			}),
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
		const parsed = AccessTokenSchema.safeParse(await res.json().catch(() => null));
		if (!res.ok || !parsed.success) {
			throw new Error(`push: OAuth token request failed (${res.status})`);
		}
		cached = {
			token: parsed.data.access_token,
			expiresAt: Date.now() + parsed.data.expires_in * 1000,
		};
		return cached.token;
	}

	async function send(token: string, message: PushMessage): Promise<PushSendResult> {
		const res = await fetch(
			`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${await accessToken()}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					message: {
						token,
						notification: { title: message.title, body: message.body },
						data: message.data,
						android: {
							notification: {
								channel_id: PUSH_CHANNEL_ID,
								tag: message.tag,
								visibility: "PRIVATE",
							},
						},
					},
				}),
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			},
		);
		if (res.ok) return "sent";
		const body: unknown = await res.json().catch(() => null);
		if (blamesToken(res.status, body)) return "invalid_token";
		console.error("push: FCM send failed", {
			status: res.status,
			error: FcmErrorSchema.safeParse(body).data?.error.status,
		});
		return "failed";
	}

	return (token, _platform, message) =>
		send(token, message).catch((error) => {
			console.error("push: FCM request failed", error instanceof Error ? error.message : error);
			return "failed";
		});
}
