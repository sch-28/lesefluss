import { defineConfig } from "drizzle-kit";

export default defineConfig({
	schema: ["./src/db/schema.ts", "./src/db/auth-schema.ts"],
	out: "./drizzle",
	dialect: "postgresql",
	dbCredentials: {
		url: process.env.DATABASE_URL!,
	},
});
