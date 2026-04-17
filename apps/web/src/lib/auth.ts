import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { eq } from "drizzle-orm";
import { db } from "~/db";
import * as authSchema from "~/db/auth-schema";
import { syncBooks, syncHighlights, syncSettings } from "~/db/schema";
import { ALLOWED_ORIGINS } from "./allowed-origins";

// Server-only — never import this file in client components.
// Use ~/lib/auth-client for browser-side session access.
export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: authSchema,
	}),
	emailAndPassword: {
		enabled: true,
		requireEmailVerification: false,
	},
	rateLimit: {
		enabled: true,
		window: 60,
		max: 10,
		storage: "memory",
	},
	// biome-ignore lint/style/noNonNullAssertion: required env vars, server fails at startup if missing
	secret: process.env.BETTER_AUTH_SECRET!,
	// biome-ignore lint/style/noNonNullAssertion: required env vars, server fails at startup if missing
	baseURL: process.env.BETTER_AUTH_URL!,
	basePath: "/api/auth",
	trustedOrigins: ALLOWED_ORIGINS,
	plugins: [tanstackStartCookies(), bearer()],
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
