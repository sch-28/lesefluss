import { defineConfig } from "drizzle-kit";

export default defineConfig({
	schema: ["./src/db/schema.ts", "./src/db/auth-schema.ts"],
	out: "./drizzle",
	dialect: "postgresql",
	// Share Postgres with apps/catalog. Explicit inclusion keeps `drizzle-kit push --force`
	// from dropping tables that belong to other services (notably catalog_*).
	tablesFilter: [
		// sync tables (schema.ts)
		"sync_*",
		// better-auth tables (auth-schema.ts)
		"user",
		"session",
		"account",
		"verification",
	],
	dbCredentials: {
		// biome-ignore lint/style/noNonNullAssertion: required env var, fails at startup if missing
		url: process.env.DATABASE_URL!,
	},
});
