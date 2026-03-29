#!/usr/bin/env node

/**
 * Deploy script — production build for Android.
 *
 * Usage:
 *   node scripts/deploy.mjs
 *   pnpm deploy          (if added to package.json scripts)
 *
 * What it does:
 *   1. Removes the `server` block from capacitor.config.json so the app
 *      loads from bundled assets instead of a live-reload dev server.
 *   2. Runs `vite build` to produce a fresh production bundle in dist/.
 *   3. Runs `npx cap copy android` to push the built assets + config to
 *      the native project.
 *
 * After this you need to build + install the APK:
 *   pnpm studio         (open Android Studio, then Build → Run)
 *   — or —
 *   pnpm android        (builds & installs directly via adb)
 *
 * The script is safe to run after `pnpm live` — it will always restore
 * the config to the clean production state regardless of what live did.
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const CONFIG_PATH = resolve(ROOT, "capacitor.config.json");

// Read & parse current config
const raw = readFileSync(CONFIG_PATH, "utf8");
const config = JSON.parse(raw);

// Strip the server block (present when live-reload is/was active)
if (config.server) {
	delete config.server;
	console.log("Removed server block from capacitor.config.json (production mode).");
} else {
	console.log("capacitor.config.json already in production mode (no server block).");
}

// Write clean production config
writeFileSync(CONFIG_PATH, JSON.stringify(config, null, "\t") + "\n", "utf8");

// Build
console.log("\nRunning: vite build...");
execSync("npx vite build", { stdio: "inherit", cwd: ROOT });

// Sync to native project
console.log("\nRunning: npx cap copy android...");
execSync("npx cap copy android", { stdio: "inherit", cwd: ROOT });

console.log("\nDone. The native project is ready for a production build.");
console.log("Run `pnpm android` or open Android Studio to install.");
