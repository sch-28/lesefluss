#!/usr/bin/env node

/**
 * Generate Android launcher icons from the master SVG.
 *
 * Source: rsvp/resources/icon.svg
 *
 * Usage:
 *   node scripts/gen-icons.mjs
 *   pnpm gen-icons
 *
 * Requires: rsvg-convert (sudo apt install librsvg2-bin)
 */

import { execSync } from "child_process";
import { existsSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const REPO_ROOT = resolve(ROOT, "../..");
const ICON_SRC = resolve(REPO_ROOT, "resources/icon.svg");
const RES = resolve(ROOT, "android/app/src/main/res");

if (!existsSync(ICON_SRC)) {
	console.error(`Icon source not found: ${ICON_SRC}`);
	process.exit(1);
}

// Check rsvg-convert is available
try {
	execSync("which rsvg-convert", { stdio: "ignore" });
} catch {
	console.error("rsvg-convert not found. Install with: sudo apt install librsvg2-bin");
	process.exit(1);
}

function render(size, dest) {
	execSync(`rsvg-convert -w ${size} -h ${size} "${ICON_SRC}" -o "${dest}"`);
	console.log(`  ${size}x${size} → ${dest.replace(ROOT + "/", "")}`);
}

console.log(`Generating icons from ${ICON_SRC.replace(REPO_ROOT + "/", "")}\n`);

// Legacy launcher icons (pre-API 26, full icon with background baked in)
console.log("Launcher icons (ic_launcher + ic_launcher_round):");
render(48, `${RES}/mipmap-mdpi/ic_launcher.png`);
render(72, `${RES}/mipmap-hdpi/ic_launcher.png`);
render(96, `${RES}/mipmap-xhdpi/ic_launcher.png`);
render(144, `${RES}/mipmap-xxhdpi/ic_launcher.png`);
render(192, `${RES}/mipmap-xxxhdpi/ic_launcher.png`);
render(48, `${RES}/mipmap-mdpi/ic_launcher_round.png`);
render(72, `${RES}/mipmap-hdpi/ic_launcher_round.png`);
render(96, `${RES}/mipmap-xhdpi/ic_launcher_round.png`);
render(144, `${RES}/mipmap-xxhdpi/ic_launcher_round.png`);
render(192, `${RES}/mipmap-xxxhdpi/ic_launcher_round.png`);

// Adaptive icon foreground (108dp canvas, API 26+)
console.log("\nAdaptive foreground (ic_launcher_foreground):");
render(108, `${RES}/mipmap-mdpi/ic_launcher_foreground.png`);
render(162, `${RES}/mipmap-hdpi/ic_launcher_foreground.png`);
render(216, `${RES}/mipmap-xhdpi/ic_launcher_foreground.png`);
render(324, `${RES}/mipmap-xxhdpi/ic_launcher_foreground.png`);
render(432, `${RES}/mipmap-xxxhdpi/ic_launcher_foreground.png`);

console.log("\nDone.");
