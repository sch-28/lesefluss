import { SYNC_URL } from "./auth-client";

export class PasswordResetError extends Error {
	constructor(readonly reason: "rate-limited" | "offline" | "unknown") {
		super(
			reason === "rate-limited"
				? "Too many attempts. Wait a moment and try again."
				: reason === "offline"
					? "Can't reach the server. Check your connection and try again."
					: "Couldn't send the reset link. Try again later.",
		);
		this.name = "PasswordResetError";
	}
}

/** The website page the mail's link lands on, where the new password is set. */
export const PASSWORD_RESET_PAGE = "/reset-password";

/**
 * Asks the server to mail a reset link. The server answers the same whether or
 * not an account has this email, so success says nothing about the account.
 */
export async function requestPasswordReset(email: string): Promise<void> {
	let res: Response;
	try {
		res = await fetch(`${SYNC_URL}/api/auth/request-password-reset`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email, redirectTo: PASSWORD_RESET_PAGE }),
		});
	} catch {
		throw new PasswordResetError("offline");
	}
	if (res.status === 429) throw new PasswordResetError("rate-limited");
	if (!res.ok) throw new PasswordResetError("unknown");
}
