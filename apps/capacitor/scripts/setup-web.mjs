#!/usr/bin/env node
/**
 * Copies sql-wasm.wasm from sql.js (jeep-sqlite's dependency) into
 * public/assets/ so Vite can serve it during development and include it
 * in production builds.
 *
 * Run after `pnpm install` whenever the public/assets/sql-wasm.wasm file
 * is missing (e.g. fresh clone). It is gitignored - don't commit the binary.
 */
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// Candidate locations for sql-wasm.wasm.
// IMPORTANT: must be sql.js@1.11.0 - jeep-sqlite@2.8.0 was compiled against that
// version. Using a newer sql.js WASM causes a LinkError at runtime.
const candidates = [
	// Explicit 1.11.0 in pnpm virtual store (added as direct dep to pin the version)
	resolve(root, "../../node_modules/.pnpm/sql.js@1.11.0/node_modules/sql.js/dist/sql-wasm.wasm"),
	// Local node_modules if pnpm hoisted it (yarn/npm workspaces)
	resolve(root, "node_modules/sql.js/dist/sql-wasm.wasm"),
	// jeep-sqlite's own bundled copy if pnpm kept it nested
	resolve(root, "node_modules/jeep-sqlite/node_modules/sql.js/dist/sql-wasm.wasm"),
];

const src = candidates.find(existsSync);
if (!src) {
	console.error("ERROR: sql-wasm.wasm not found. Tried:");
	candidates.forEach((c) => {
		console.error(" ", c);
	});
	process.exit(1);
}

const dest = resolve(root, "public/assets/sql-wasm.wasm");
mkdirSync(dirname(dest), { recursive: true });
cpSync(src, dest);
console.log(`Copied ${src}\n  → ${dest}`);
