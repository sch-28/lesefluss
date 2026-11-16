import type { DeleteAccountRefusal } from "@lesefluss/core";
import { eq } from "drizzle-orm";
import { db } from "~/db";
import { account } from "~/db/auth-schema";
import { auth } from "./auth";

/** How recent a Google or Discord sign-in must be to delete an account that has no password. */
export const FRESH_SIGN_IN_MS = 10 * 60_000;

/** Also caps password guesses: three deletion attempts a minute per user. */
export const ACCOUNT_DELETE_LIMIT = { max: 3, windowMs: 60_000 };
export const accountDeleteLimitKey = (userId: string) => `account-delete:${userId}`;

/**
 * Re-authentication for an account deletion: the password when the account has
 * one, else a Google or Discord sign-in within FRESH_SIGN_IN_MS. Null means the
 * deletion may go ahead.
 *
 * The session's age proves nothing: the device-link flow mints a new session
 * without any sign-in. An OAuth sign-in rewrites its account row's tokens, so
 * that row's updatedAt is the sign-in time. The routes that could touch account
 * rows from a session alone (link, unlink, token refresh) are disabled in auth.ts.
 */
export async function accountDeletionRefusal(
	userId: string,
	password: string | undefined,
	now: Date = new Date(),
): Promise<DeleteAccountRefusal | null> {
	const rows = await db
		.select({
			providerId: account.providerId,
			password: account.password,
			updatedAt: account.updatedAt,
		})
		.from(account)
		.where(eq(account.userId, userId));
	const hash = rows.find((r) => r.providerId === "credential")?.password;
	if (!hash) {
		const lastOAuthSignIn = Math.max(
			0,
			...rows
				.filter((r) => r.providerId !== "credential")
				.map((r) => new Date(r.updatedAt).getTime()),
		);
		return now.getTime() - lastOAuthSignIn <= FRESH_SIGN_IN_MS ? null : "reauth_required";
	}
	if (!password) return "password_required";
	const ctx = await auth.$context;
	return (await ctx.password.verify({ hash, password })) ? null : "wrong_password";
}
