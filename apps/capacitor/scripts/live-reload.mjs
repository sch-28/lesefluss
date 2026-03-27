#!/usr/bin/env node

/**
 * Live Reload via adb reverse (USB tunnel).
 *
 * Usage:
 *   node scripts/live-reload.mjs [port]   default port: 3000
 *
 * What it does:
 *   1. Patches capacitor.config.json with server.url = http://localhost:<port>
 *   2. Runs `npx cap copy android` to push the config to the native project
 *   3. Runs `adb reverse tcp:<port> tcp:<port>` to tunnel the port over USB
 *   4. Starts Vite dev server on localhost:<port>
 *   5. On Ctrl+C: removes the server entry, restores config, removes adb tunnel
 *
 * Phone must be connected via USB with USB debugging enabled.
 * Redeploy the APK once after running this script for the first time.
 */

import { execSync, spawn } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const CONFIG_PATH = resolve(ROOT, "capacitor.config.json");

const port = process.argv[2] ?? "3000";
const serverUrl = `http://localhost:${port}`;

// --- Read original config (preserve formatting) ---
const originalConfig = readFileSync(CONFIG_PATH, "utf8");
const config = JSON.parse(originalConfig); // validate it's not already broken

function restoreConfig() {
	console.log("\nRestoring capacitor.config.json...");
	writeFileSync(CONFIG_PATH, originalConfig, "utf8");
}

// --- Patch config ---
const patched = { ...config, server: { url: serverUrl, cleartext: true } };
writeFileSync(CONFIG_PATH, JSON.stringify(patched, null, 2) + "\n", "utf8");
console.log(`Patched capacitor.config.json → ${serverUrl}`);

// --- cap copy android ---
try {
	console.log("Running: npx cap copy android...");
	execSync("npx cap copy android", { stdio: "inherit", cwd: ROOT });
} catch {
	console.error("cap copy failed. Restoring config.");
	restoreConfig();
	process.exit(1);
}

// --- adb reverse ---
try {
	console.log(`Running: adb reverse tcp:${port} tcp:${port}...`);
	execSync(`adb reverse tcp:${port} tcp:${port}`, { stdio: "inherit" });
	console.log("adb tunnel established.");
} catch {
	console.error("adb reverse failed. Is the phone connected with USB debugging on?");
	restoreConfig();
	process.exit(1);
}

// --- Start Vite ---
console.log(`\nStarting Vite on localhost:${port}...`);
console.log("Redeploy the APK once if this is the first time (pnpm android).\n");

const vite = spawn("npx", ["vite", "--port", port], {
	stdio: "inherit",
	cwd: ROOT,
	shell: true,
});

// --- Cleanup ---
let cleaned = false;
function cleanup() {
	if (cleaned) return;
	cleaned = true;
	restoreConfig();
	try {
		execSync(`adb reverse --remove tcp:${port}`, { stdio: "ignore" });
		console.log("adb tunnel removed.");
	} catch {
		/* ignore if adb not available */
	}
	vite.kill();
	process.exit(0);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
vite.on("exit", (code) => {
	if (!cleaned) {
		cleaned = true;
		restoreConfig();
		try {
			execSync(`adb reverse --remove tcp:${port}`, { stdio: "ignore" });
		} catch {}
	}
	process.exit(code ?? 0);
});
