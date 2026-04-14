import { defineConfig } from "drizzle-kit";

export default defineConfig({
	schema: ["./src/db/schema.ts", "./src/db/auth-schema.ts"],
	out: "./drizzle",
	dialect: "postgresql",
	dbCredentials: {
		// biome-ignore lint/style/noNonNullAssertion: required env var, fails at startup if missing
		url: process.env.DATABASE_URL!,
	},
});
