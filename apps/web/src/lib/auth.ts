import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { db } from "~/db";
import * as authSchema from "~/db/auth-schema";

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
	secret: process.env.BETTER_AUTH_SECRET!,
	baseURL: process.env.BETTER_AUTH_URL!,
	basePath: "/api/auth",
	plugins: [
		// REQUIRED for TanStack Start: handles cookie setting on sign-in/sign-up
		tanstackStartCookies(),
	],
});

export type Session = typeof auth.$Infer.Session;
export type AuthUser = typeof auth.$Infer.Session.user;
