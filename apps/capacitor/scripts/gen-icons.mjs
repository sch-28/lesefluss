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
 *
 * Outputs:
 *   ic_launcher + ic_launcher_round  — full icon (background baked in), legacy pre-API 26
 *   ic_launcher_foreground PNGs      — background rect stripped, transparent bg for adaptive icons
 *   drawable-v24/ic_launcher_foreground.xml — Android vector drawable (scales to any size)
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

// Build a foreground-only SVG by removing the background <rect id="rect1"> element.
const iconSvg = readFileSync(ICON_SRC, "utf8");
const fgSvg = iconSvg.replace(
	/<rect[^/]*id="rect1"[^/]*\/>/s,
	"<!-- background removed for adaptive icon foreground -->",
);
const fgTmp = join(tmpdir(), "ic_launcher_foreground.svg");
writeFileSync(fgTmp, fgSvg, "utf8");

function render(src, size, dest) {
	mkdirSync(dirname(dest), { recursive: true });
	execSync(`rsvg-convert -w ${size} -h ${size} "${src}" -o "${dest}"`);
	console.log(`  ${size}x${size} → ${dest.replace(`${ROOT}/`, "")}`);
}

console.log(`Generating icons from ${ICON_SRC.replace(`${REPO_ROOT}/`, "")}\n`);

// Legacy launcher icons (full icon with background baked in)
console.log("Launcher icons (ic_launcher + ic_launcher_round):");
render(ICON_SRC, 48, `${RES}/mipmap-mdpi/ic_launcher.png`);
render(ICON_SRC, 72, `${RES}/mipmap-hdpi/ic_launcher.png`);
render(ICON_SRC, 96, `${RES}/mipmap-xhdpi/ic_launcher.png`);
render(ICON_SRC, 144, `${RES}/mipmap-xxhdpi/ic_launcher.png`);
render(ICON_SRC, 192, `${RES}/mipmap-xxxhdpi/ic_launcher.png`);
render(ICON_SRC, 48, `${RES}/mipmap-mdpi/ic_launcher_round.png`);
render(ICON_SRC, 72, `${RES}/mipmap-hdpi/ic_launcher_round.png`);
render(ICON_SRC, 96, `${RES}/mipmap-xhdpi/ic_launcher_round.png`);
render(ICON_SRC, 144, `${RES}/mipmap-xxhdpi/ic_launcher_round.png`);
render(ICON_SRC, 192, `${RES}/mipmap-xxxhdpi/ic_launcher_round.png`);

// Adaptive icon foreground PNGs (transparent bg, 108dp canvas, API 26+)
console.log("\nAdaptive foreground PNGs (ic_launcher_foreground, transparent bg):");
render(fgTmp, 108, `${RES}/mipmap-mdpi/ic_launcher_foreground.png`);
render(fgTmp, 162, `${RES}/mipmap-hdpi/ic_launcher_foreground.png`);
render(fgTmp, 216, `${RES}/mipmap-xhdpi/ic_launcher_foreground.png`);
render(fgTmp, 324, `${RES}/mipmap-xxhdpi/ic_launcher_foreground.png`);
render(fgTmp, 432, `${RES}/mipmap-xxxhdpi/ic_launcher_foreground.png`);

unlinkSync(fgTmp);

// Generate drawable-v24/ic_launcher_foreground.xml vector drawable.
// Scales the SVG shapes from 1024×1024 → 108×108 Android viewport.
// The adaptive icon system clips to a circle/squircle, so we inset slightly.
const scale = 108 / 1024;
const s = (n) => (n * scale).toFixed(5);

// Extract computed path data from the book shape. The SVG uses a transform:
// matrix(0.67675724,0,0,0.636341,165.29342,172.85054) on the path.
// We bake that transform in by applying it to the coordinate space ourselves
// via the SVG viewBox — easier to just re-embed the original SVG elements
// scaled to 108×108 using a nested <svg> trick in the vector drawable.
//
// Android Vector Drawable doesn't support <image> or nested <svg>, so we
// translate each element manually.

// Book body path — original d with transform baked in via scale
// Original transform: matrix(0.67675724,0,0,0.636341,165.29342,172.85054)
// Combined with our 1024→108 scale: multiply each coordinate accordingly
const mx = 0.67675724;
const my = 0.636341;
const tx = 165.29342;
const ty = 172.85054;
const _bakeX = (x) => s(x * mx + tx);
const _bakeY = (y) => s(y * my + ty);

// Book shape path points (from inkscape:original-d, pre-LPE):
// M 510.08,280.32 -265.6,80.64 0.64,378.88 266.24,-78.72 266.88,77.44 V 360.32 Z
// These are absolute coords in the 1024 space before the matrix transform.
// After matrix + scale to 108:
const bx = (x) => ((x * mx + tx) * scale).toFixed(5);
const by = (y) => ((y * my + ty) * scale).toFixed(5);

const bookPath = `M ${bx(510.08)},${by(280.32)} L ${bx(244.48)},${by(360.96)} L ${bx(245.12)},${by(739.84)} L ${bx(511.36)},${by(661.12)} L ${bx(778.24)},${by(738.56)} L ${bx(778.24)},${by(360.32)} Z`;

// Helper to scale plain 1024-space coordinates
const x = (n) => (n * scale).toFixed(5);
const y = (n) => (n * scale).toFixed(5);

const vectorXml = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">

    <!-- Book body -->
    <path
        android:fillColor="#e4e4e4"
        android:pathData="${bookPath}" />

    <!-- Spine cap (top triangle / shadow) -->
    <path
        android:fillColor="#7f7f7f"
        android:pathData="M ${x(691.97297)},${y(402.13692)} L ${x(674.20862)},${y(387.41075)} L ${x(511.76486)},${y(335.15203)} L ${x(350.10982)},${y(387.41075)} L ${x(330.74703)},${y(402.54418)} L ${x(511.79312)},${y(351.01308)} Z" />

    <!-- Spine line -->
    <path
        android:strokeColor="#656565"
        android:strokeWidth="${s(12.1816)}"
        android:strokeLineCap="round"
        android:pathData="M ${x(511.79312)},${y(351.01309)} L ${x(511.79312)},${y(593.66644)}" />

    <!-- Left page lines -->
    <path android:strokeColor="#888888" android:strokeWidth="${s(9.4746)}" android:strokeLineCap="round"
        android:pathData="M ${x(358.517)},${y(455.02307)} L ${x(477.12296)},${y(424.11945)}" />
    <path android:strokeColor="#888888" android:strokeWidth="${s(9.4746)}" android:strokeLineCap="round"
        android:pathData="M ${x(363.86697)},${y(491.85822)} L ${x(482.47293)},${y(460.95459)}" />
    <path android:strokeColor="#888888" android:strokeWidth="${s(9.4746)}" android:strokeLineCap="round"
        android:pathData="M ${x(368.30511)},${y(524.96136)} L ${x(458.3475)},${y(503.46729)}" />
    <path android:strokeColor="#888888" android:strokeWidth="${s(9.4746)}" android:strokeLineCap="round"
        android:pathData="M ${x(374.56696)},${y(565.52856)} L ${x(479.77832)},${y(536.57037)}" />

    <!-- Right page lines -->
    <path android:strokeColor="#888888" android:strokeWidth="${s(9.4746)}" android:strokeLineCap="round"
        android:pathData="M ${x(543.05994)},${y(424.11945)} L ${x(661.79309)},${y(454.53082)}" />
    <path android:strokeColor="#888888" android:strokeWidth="${s(9.4746)}" android:strokeLineCap="round"
        android:pathData="M ${x(540.97327)},${y(461.18979)} L ${x(659.70642)},${y(491.60114)}" />
    <path android:strokeColor="#888888" android:strokeWidth="${s(9.4746)}" android:strokeLineCap="round"
        android:pathData="M ${x(540.97327)},${y(501.07574)} L ${x(614.96295)},${y(518.96844)}" />
    <path android:strokeColor="#888888" android:strokeWidth="${s(9.4746)}" android:strokeLineCap="round"
        android:pathData="M ${x(540.97327)},${y(535.59741)} L ${x(646.30389)},${y(564.1189)}" />

</vector>
`;

const vectorDest = `${RES}/drawable-v24/ic_launcher_foreground.xml`;
writeFileSync(vectorDest, vectorXml, "utf8");
console.log(`\nVector drawable → ${vectorDest.replace(`${ROOT}/`, "")}`);

console.log("\nDone.");
