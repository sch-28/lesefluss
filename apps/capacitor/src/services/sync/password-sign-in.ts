import { SYNC_URL } from "./auth-client";
import { SIGN_IN_FAILED_MESSAGE } from "./sign-in-copy";

type PasswordSignInFailure =
	| "invalid-credentials"
	| "email-not-verified"
	| "rate-limited"
	| "offline"
	| "unknown";

export class PasswordSignInError extends Error {
	constructor(readonly reason: PasswordSignInFailure) {
		super(passwordSignInMessage(reason));
		this.name = "PasswordSignInError";
	}
}

function passwordSignInMessage(reason: PasswordSignInFailure): string {
	switch (reason) {
		case "invalid-credentials":
			return "Wrong email or password.";
		case "email-not-verified":
			return "Your email is not verified yet. We sent you a new verification link; open it, then sign in again.";
		case "rate-limited":
			return "Too many attempts. Wait a moment and try again.";
		case "offline":
			return "Can't reach the server. Check your connection and try again.";
		case "unknown":
			return SIGN_IN_FAILED_MESSAGE;
	}
}

// better-auth answers every 403 with a `code`; only the verification one gets
// its own copy, the rest (origin checks, proxies) must not claim a mail was sent.
function failureForResponse(status: number, body: unknown): PasswordSignInFailure {
	const code =
		typeof body === "object" && body !== null ? (body as { code?: unknown }).code : undefined;
	if (code === "EMAIL_NOT_VERIFIED") return "email-not-verified";
	if (code === "INVALID_EMAIL_OR_PASSWORD") return "invalid-credentials";
	if (status === 401) return "invalid-credentials";
	if (status === 429) return "rate-limited";
	return "unknown";
}

/**
 * Signs in with email and password straight against the sync server and
 * returns the raw session token. It is the same token the website hands over
 * through the deep link, so the caller finishes exactly like that flow.
 */
export async function signInWithPassword(email: string, password: string): Promise<string> {
	let res: Response;
	try {
		res = await fetch(`${SYNC_URL}/api/auth/sign-in/email`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email, password }),
		});
	} catch {
		throw new PasswordSignInError("offline");
	}

	const body: unknown = await res.json().catch(() => null);
	if (!res.ok) throw new PasswordSignInError(failureForResponse(res.status, body));

	const token =
		typeof body === "object" && body !== null ? (body as { token?: unknown }).token : undefined;
	if (typeof token !== "string" || token === "") throw new PasswordSignInError("unknown");
	return token;
}
