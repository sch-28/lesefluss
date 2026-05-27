import { defineConfig, devices } from "@playwright/test";

const PORT = 3001;

export default defineConfig({
	testDir: "./e2e",
	timeout: 60_000,
	fullyParallel: false,
	workers: 1,
	reporter: process.env.CI ? "line" : "list",
	use: {
		baseURL: `http://localhost:${PORT}`,
		trace: "retain-on-failure",
	},
	webServer: {
		command: "pnpm dev --no-open",
		port: PORT,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
