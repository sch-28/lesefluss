import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DB_PREFIX } from "./users.mjs";

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
export const WEB = resolve(REPO, "apps/web");
export const CAP = resolve(REPO, "apps/capacitor");
export const requireWeb = createRequire(resolve(WEB, "package.json"));

/**
 * The Postgres server to create the throwaway database on: E2E_APP_PG_URL, or
 * the server of apps/web/.env's DATABASE_URL. Only the server is reused; the
 * database named there is never opened.
 */
function serverUrl() {
	if (process.env.E2E_APP_PG_URL) return process.env.E2E_APP_PG_URL;
	const env = readFileSync(resolve(WEB, ".env"), "utf8");
	const line = env.split("\n").find((l) => l.startsWith("DATABASE_URL="));
	if (!line) throw new Error("Set E2E_APP_PG_URL or DATABASE_URL in apps/web/.env");
	return line.slice("DATABASE_URL=".length).trim().replace(/^"|"$/g, "");
}

export function databaseUrl(name) {
	const url = new URL(serverUrl());
	url.pathname = `/${name}`;
	return url.toString();
}

function assertThrowaway(name) {
	if (!name?.startsWith(DB_PREFIX) || !/^[a-z0-9_]+$/.test(name)) {
		throw new Error(`Refusing to touch database "${name}": not an e2e throwaway`);
	}
}

async function withAdmin(fn) {
	const { Client } = requireWeb("pg");
	const client = new Client({ connectionString: databaseUrl("postgres") });
	await client.connect();
	try {
		return await fn(client);
	} finally {
		await client.end();
	}
}

export async function createDatabase(name) {
	assertThrowaway(name);
	await withAdmin((c) => c.query(`CREATE DATABASE "${name}"`));
}

export async function dropDatabase(name) {
	assertThrowaway(name);
	await withAdmin((c) => c.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`));
}

/** Databases a killed run left behind; only one run can hold the fixed port at a time. */
export async function dropLeftoverDatabases() {
	const { rows } = await withAdmin((c) =>
		c.query("SELECT datname FROM pg_database WHERE datname LIKE $1", [`${DB_PREFIX}%`]),
	);
	for (const { datname } of rows) await dropDatabase(datname);
}
