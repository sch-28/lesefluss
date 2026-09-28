import { defineConfig, devices } from "@playwright/test";
import { DB_PREFIX } from "./e2e-app/support/users.mjs";

/**
 * The web app as users get it at lesefluss.app/app: the WEB_BUILD bundle served
 * by the production apps/web server, against a throwaway Postgres database.
 * The dev-mode suite is playwright.config.ts (`pnpm e2e`).
 */
const PORT = 3417;
// Set once in the runner; workers inherit it, so every process names the same database.
process.env.E2E_APP_DB ??= `${DB_PREFIX}${Date.now()}`;
process.env.E2E_APP_PORT = String(PORT);

export default defineConfig({
	testDir: "./e2e-app",
	timeout: 60_000,
	fullyParallel: false,
	// One server holds in-memory state (live board, rate limits) shared by every spec.
	workers: 1,
	reporter: process.env.CI ? "line" : "list",
	use: {
		baseURL: `http://localhost:${PORT}`,
		trace: "retain-on-failure",
	},
	webServer: {
		command: "node e2e-app/support/serve.mjs",
		url: `http://localhost:${PORT}/app/`,
		reuseExistingServer: false,
		timeout: 10 * 60_000,
		stdout: "ignore",
		// serve.mjs drops the throwaway database after the server stops.
		gracefulShutdown: { signal: "SIGTERM", timeout: 15_000 },
	},
	projects: [
		{ name: "setup", testMatch: /setup\/.*\.setup\.ts/ },
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
			testMatch: /.*\.spec\.ts/,
			dependencies: ["setup"],
		},
	],
});
