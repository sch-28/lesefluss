import { DEVICE_LINK_CLIENT_ID } from "@lesefluss/core";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, bearer, deviceAuthorization } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { db } from "~/db";
import * as authSchema from "~/db/auth-schema";
import { getTrustedAuthOrigins } from "./allowed-origins";
import { generateDeviceLinkUserCode } from "./device-link-code";
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
		// Direct hits on the device endpoints. Approve and verify take a user code:
		// 32^8 codes, 10 minute lifetime, a handful of guesses per IP per minute
		// keeps brute force hopeless. The website's /link page calls auth.api
		// server-side and is limited separately in lib/device-link.ts.
		// The token poll runs every 3 s for up to 10 minutes; the limiter's count
		// only resets after a full idle window, so its window must be shorter
		// than the poll interval or the 11th poll gets a 429.
		customRules: {
			"/device/code": { window: 60, max: 5 },
			"/device/token": { window: 2, max: 5 },
			"/device/approve": { window: 60, max: 10 },
			"/device/deny": { window: 60, max: 10 },
			"/device": { window: 60, max: 20 },
		},
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
	plugins: [
		tanstackStartCookies(),
		bearer(),
		admin(),
		deviceAuthorization({
			expiresIn: "10m",
			interval: "3s",
			generateUserCode: generateDeviceLinkUserCode,
			validateClient: (clientId) => clientId === DEVICE_LINK_CLIENT_ID,
			verificationUri: `${requireEnv("BETTER_AUTH_URL")}/link`,
		}),
	],
	// Accounts are deleted only through deleteUserAccount, which purges and
	// deletes in one transaction. better-auth's own routes delete the user row
	// separately from any purge (or skip it), so they are switched off.
	disabledPaths: ["/delete-user", "/admin/remove-user"],
});

export type Session = typeof auth.$Infer.Session;
export type AuthUser = typeof auth.$Infer.Session.user;
