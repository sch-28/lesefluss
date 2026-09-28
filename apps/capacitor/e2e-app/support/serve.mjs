/**
 * The webServer for playwright.app.config.ts. Creates and migrates a throwaway
 * database, seeds the test accounts, builds the /app bundle and the website the
 * way the Dockerfile does, then runs the production server. The database is
 * dropped here once the server has stopped: the runner's globalTeardown runs
 * while the server still holds connections.
 */
import { execFileSync, spawn } from "node:child_process";
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
	CAP,
	createDatabase,
	databaseUrl,
	dropDatabase,
	dropLeftoverDatabases,
	requireWeb,
	WEB,
} from "./db.mjs";
import { PASSWORD, USERS } from "./users.mjs";

const name = process.env.E2E_APP_DB;
const port = process.env.E2E_APP_PORT;
if (!name || !port) throw new Error("Run through playwright.app.config.ts");
const baseUrl = `http://localhost:${port}`;
const DATABASE_URL = databaseUrl(name);

function run(cmd, args, cwd, env = {}) {
	execFileSync(cmd, args, { cwd, stdio: "inherit", env: { ...process.env, ...env } });
}

async function seedUsers() {
	const { Client } = requireWeb("pg");
	const { hashPassword } = await import(
		pathToFileURL(requireWeb.resolve("better-auth/crypto")).href
	);
	const hash = await hashPassword(PASSWORD);
	const client = new Client({ connectionString: DATABASE_URL });
	await client.connect();
	try {
		for (const u of Object.values(USERS)) {
			await client.query(
				`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
				 VALUES ($1, $2, $3, true, now(), now())`,
				[u.id, u.name, u.email],
			);
			await client.query(
				`INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
				 VALUES ($1, $2, 'credential', $2, $3, now(), now())`,
				[`${u.id}-credential`, u.id, hash],
			);
		}
	} finally {
		await client.end();
	}
}

function buildAll() {
	const output = resolve(WEB, ".output/server/index.mjs");
	const embed = resolve(WEB, "public/app/index.html");
	if (process.env.E2E_APP_REUSE_BUILD === "1" && existsSync(output) && existsSync(embed)) {
		console.log("[e2e:app] E2E_APP_REUSE_BUILD=1: reusing apps/web/.output and public/app");
		return;
	}
	run("node", ["scripts/setup-web.mjs"], CAP);
	run("pnpm", ["build"], CAP, { WEB_BUILD: "1", VITE_SYNC_URL: "", VITE_WEB_BUILD: "true" });
	rmSync(resolve(WEB, "public/app"), { recursive: true, force: true });
	cpSync(resolve(CAP, "dist"), resolve(WEB, "public/app"), { recursive: true });
	const index = readFileSync(embed, "utf8");
	if (!index.includes('name="robots"')) {
		writeFileSync(
			embed,
			index.replace("<head>", '<head>\n    <meta name="robots" content="noindex, nofollow" />'),
		);
	}
	// Build-time values from apps/web/.env that would point the test build at
	// real analytics or error tracking are blanked.
	run("pnpm", ["build"], WEB, {
		BETTER_AUTH_URL: baseUrl,
		UMAMI_URL: "",
		VITE_SENTRY_DSN: "",
		SENTRY_DSN: "",
	});
}

await dropLeftoverDatabases();
await createDatabase(name);
try {
	run("npx", ["drizzle-kit", "migrate"], WEB, { DATABASE_URL });
	await seedUsers();
	buildAll();
} catch (err) {
	await dropDatabase(name);
	throw err;
}

const server = spawn("node", [resolve(WEB, ".output/server/index.mjs")], {
	cwd: WEB,
	stdio: "inherit",
	env: {
		...process.env,
		PORT: port,
		HOST: "localhost",
		NODE_ENV: "production",
		DATABASE_URL,
		BETTER_AUTH_URL: baseUrl,
		BETTER_AUTH_SECRET: "e2e-app-secret-not-for-production-use-000000",
		// Required at startup; the tests never reach these providers or send mail.
		GOOGLE_CLIENT_ID: "e2e",
		GOOGLE_CLIENT_SECRET: "e2e",
		DISCORD_CLIENT_ID: "e2e",
		DISCORD_CLIENT_SECRET: "e2e",
		RESEND_API_KEY: "e2e-no-mail",
		SENTRY_DSN: "",
		UMAMI_URL: "",
	},
});
for (const signal of ["SIGINT", "SIGTERM"]) {
	process.on(signal, () => {
		server.kill(signal);
		// Open live-board streams keep a graceful stop waiting past the runner's own timeout.
		setTimeout(() => server.kill("SIGKILL"), 3000).unref();
	});
}
server.on("exit", async (code) => {
	await dropDatabase(name).catch((err) =>
		console.error("[e2e:app] dropping the database failed", err),
	);
	process.exit(code ?? 0);
});
