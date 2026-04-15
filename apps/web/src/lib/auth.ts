import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { db } from "~/db";
import * as authSchema from "~/db/auth-schema";
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
	// biome-ignore lint/style/noNonNullAssertion: required env vars, server fails at startup if missing
	secret: process.env.BETTER_AUTH_SECRET!,
	// biome-ignore lint/style/noNonNullAssertion: required env vars, server fails at startup if missing
	baseURL: process.env.BETTER_AUTH_URL!,
	basePath: "/api/auth",
	trustedOrigins: ALLOWED_ORIGINS,
	plugins: [
		// REQUIRED for TanStack Start: handles cookie setting on sign-in/sign-up
		tanstackStartCookies(),
	],
});

export type Session = typeof auth.$Infer.Session;
export type AuthUser = typeof auth.$Infer.Session.user;
