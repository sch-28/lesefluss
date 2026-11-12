import { defineConfig, devices } from "@playwright/test";

/** E2E_PORT when something else already serves 3001 (on the host; `pnpm e2e` runs in its own network namespace). */
function portFromEnv(value: string | undefined): number {
	if (!value) return 3001;
	if (/^[1-9]\d{3,4}$/.test(value) && Number(value) <= 65535) return Number(value);
	throw new Error(`E2E_PORT must be a port number like "3101", not "${value}"`);
}
const PORT = portFromEnv(process.env.E2E_PORT);

/** A count ("2") or a share of the cores ("50%"); Playwright takes the latter only as a string. */
function workersFromEnv(value: string | undefined): number | string | undefined {
	if (!value) return undefined;
	if (/^[1-9]\d*%$/.test(value)) return value;
	if (/^[1-9]\d*$/.test(value)) return Number(value);
	throw new Error(`E2E_WORKERS must be a count like "2" or a share like "50%", not "${value}"`);
}

/**
 * Lanes that take minutes per test run only on their own: `pnpm e2e:lowfps` (1 fps
 * BeginFrameControl) and `pnpm e2e:dbscale` (a ~200 MB library, LESE-121.6).
 */
function optInLanesOff(): RegExp | undefined {
	const off = [
		process.env.E2E_LOWFPS ? null : "@lowfps",
		process.env.E2E_DBSCALE ? null : "@dbscale",
	].filter(Boolean);
	return off.length ? new RegExp(off.join("|")) : undefined;
}

export default defineConfig({
	testDir: "./e2e",
	timeout: 60_000,
	// Every test seeds its own browser context (storage, routes), so tests run in
	// parallel; E2E_WORKERS overrides the count ("1" to debug one at a time, or "50%").
	fullyParallel: true,
	workers: workersFromEnv(process.env.E2E_WORKERS) ?? 4,
	grepInvert: optInLanesOff(),
	reporter: process.env.CI ? "line" : "list",
	use: {
		baseURL: `http://localhost:${PORT}`,
		trace: "retain-on-failure",
	},
	webServer: {
		command: `pnpm dev --no-open --port ${PORT} --strictPort`,
		port: PORT,
		env: { E2E_SERVER: "1" },
		// Reuse only on request (E2E_REUSE): whatever answers on the port would be
		// taken for the app, even another project's server. A reused dev server also
		// runs without E2E_SERVER, so HMR and on-demand pre-bundling stay on.
		reuseExistingServer: !!process.env.E2E_REUSE,
		timeout: 120_000,
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
