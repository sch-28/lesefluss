import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, bearer } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { eq } from "drizzle-orm";
import { db } from "~/db";
import * as authSchema from "~/db/auth-schema";
import { syncBooks, syncHighlights, syncSettings } from "~/db/schema";
import { getTrustedAuthOrigins } from "./allowed-origins";
import { passwordResetEmail, sendMail, verificationEmail } from "./mailer";

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is required`);
	return value;
}

// Server-only - never import this file in client components.
// Use ~/lib/auth-client for browser-side session access.
export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: authSchema,
	}),
	emailAndPassword: {
		enabled: true,
		requireEmailVerification: true,
		sendResetPassword: async ({ user, url }) => {
			await sendMail({ to: user.email, ...passwordResetEmail(url) });
		},
	},
	emailVerification: {
		sendOnSignUp: true,
		sendOnSignIn: true,
		autoSignInAfterVerification: true,
		sendVerificationEmail: async ({ user, url }) => {
			await sendMail({ to: user.email, ...verificationEmail(url) });
		},
	},
	rateLimit: {
		enabled: true,
		window: 60,
		max: 10,
		storage: "memory",
	},
	secret: requireEnv("BETTER_AUTH_SECRET"),
	baseURL: requireEnv("BETTER_AUTH_URL"),
	basePath: "/api/auth",
	trustedOrigins: getTrustedAuthOrigins,
	socialProviders: {
		google: {
			clientId: requireEnv("GOOGLE_CLIENT_ID"),
			clientSecret: requireEnv("GOOGLE_CLIENT_SECRET"),
			prompt: "select_account",
		},
		discord: {
			clientId: requireEnv("DISCORD_CLIENT_ID"),
			clientSecret: requireEnv("DISCORD_CLIENT_SECRET"),
		},
	},
	plugins: [tanstackStartCookies(), bearer(), admin()],
	user: {
		deleteUser: {
			enabled: true,
			afterDelete: async (user) => {
				await Promise.all([
					db.delete(syncBooks).where(eq(syncBooks.userId, user.id)),
					db.delete(syncHighlights).where(eq(syncHighlights.userId, user.id)),
					db.delete(syncSettings).where(eq(syncSettings.userId, user.id)),
				]);
			},
		},
	},
});

export type Session = typeof auth.$Infer.Session;
export type AuthUser = typeof auth.$Infer.Session.user;
