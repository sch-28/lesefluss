/// <reference types="vitest/config" />
import fs from "node:fs";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
// Relative, not the package name: the config is bundled for Node, which cannot
// load the workspace package's TypeScript entry.
import { engineCheckScript, MIN_CHROMIUM } from "../../packages/core/src/engine-support";

// IMPORTANT: must be sql.js@1.11.0 - jeep-sqlite@2.8.0 was compiled against that
// version. Using a newer WASM causes a LinkError ("import object field 'I' is not a Function").
const sqlWasmCandidates = [
	// Explicit 1.11.0 pinned as a direct dep
	path.resolve(
		__dirname,
		"../../node_modules/.pnpm/sql.js@1.11.0/node_modules/sql.js/dist/sql-wasm.wasm",
	),
	// Local hoisted copy (yarn/npm)
	path.resolve(__dirname, "node_modules/sql.js/dist/sql-wasm.wasm"),
	// Nested inside jeep-sqlite
	path.resolve(__dirname, "node_modules/jeep-sqlite/node_modules/sql.js/dist/sql-wasm.wasm"),
];
const wasmFile = sqlWasmCandidates.find(fs.existsSync);
if (!wasmFile) throw new Error("sql-wasm.wasm (1.11.0) not found - run pnpm setup:web");

/** Puts the old-engine check right after <meta charset>, ahead of any app CSS or JS. */
function engineCheck(): Plugin {
	const platform = process.env.WEB_BUILD ? "web" : "android";
	let telemetryUrl = "";
	return {
		name: "engine-check",
		configResolved(config) {
			const syncUrl = loadEnv(config.mode, __dirname, "VITE_").VITE_SYNC_URL?.trim();
			telemetryUrl = syncUrl && platform !== "web" ? `${syncUrl}/api/telemetry` : "";
		},
		transformIndexHtml: {
			order: "pre",
			handler(html) {
				const charset = '<meta charset="UTF-8" />';
				if (!html.includes(charset)) throw new Error(`engine-check: index.html lost ${charset}`);
				const script = engineCheckScript({
					telemetryUrl,
					platform,
					shouldHideSplash: platform === "android",
				});
				// After the charset: browsers only look for it in the first 1024 bytes.
				return html
					.replace(charset, `${charset}\n    <script>${script}</script>`)
					.replaceAll("%MIN_CHROMIUM%", String(MIN_CHROMIUM))
					.replaceAll("%ENGINE_PLATFORM%", platform);
			},
		},
	};
}

const IS_WEB_BUILD = Boolean(process.env.WEB_BUILD);
const BASE = IS_WEB_BUILD ? "/app/" : "/";
// The light theme's background (tokens.css), so the launch screen matches first paint.
const MANIFEST_BACKGROUND = "#fdfcfb";

/**
 * Makes the web build installable: emits manifest.webmanifest and links it with
 * the Home Screen meta tags. Scope "/" keeps the website's /login and /account in
 * the app window (LESE-20.1). The Android build gets neither.
 */
function webAppManifest(): Plugin {
	const manifest = {
		id: BASE,
		name: "Lesefluss",
		short_name: "Lesefluss",
		description: "Read your books faster: RSVP, scroll and page reader, synced across devices.",
		lang: "en",
		start_url: BASE,
		scope: "/",
		display: "standalone",
		background_color: MANIFEST_BACKGROUND,
		theme_color: MANIFEST_BACKGROUND,
		icons: [
			{ src: `${BASE}icons/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
			{ src: `${BASE}icons/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
			{
				src: `${BASE}icons/icon-maskable-512.png`,
				sizes: "512x512",
				type: "image/png",
				purpose: "maskable",
			},
		],
	};
	return {
		name: "web-app-manifest",
		apply: () => IS_WEB_BUILD,
		configureServer(server) {
			server.middlewares.use(`${BASE}manifest.webmanifest`, (_req, res) => {
				res.setHeader("Content-Type", "application/manifest+json");
				res.end(JSON.stringify(manifest));
			});
		},
		generateBundle() {
			this.emitFile({
				type: "asset",
				fileName: "manifest.webmanifest",
				source: `${JSON.stringify(manifest, null, "\t")}\n`,
			});
		},
		transformIndexHtml() {
			const meta = (name: string, content: string) => ({ tag: "meta", attrs: { name, content } });
			return [
				{ tag: "link", attrs: { rel: "manifest", href: `${BASE}manifest.webmanifest` } },
				meta("theme-color", MANIFEST_BACKGROUND),
				meta("mobile-web-app-capable", "yes"),
				meta("apple-mobile-web-app-capable", "yes"),
				meta("apple-mobile-web-app-title", "Lesefluss"),
				// Not black-translucent: its white text cannot change at runtime and vanishes
				// on the light themes. With default, iOS paints the bar in theme-color.
				meta("apple-mobile-web-app-status-bar-style", "default"),
			].map((tag) => ({ ...tag, injectTo: "head" as const }));
		},
	};
}

export default defineConfig({
	base: BASE,
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "src"),
		},
	},
	plugins: [
		tanstackRouter({
			target: "react",
			autoCodeSplitting: true,
			routesDirectory: path.resolve(__dirname, "src/routes"),
			generatedRouteTree: path.resolve(__dirname, "src/routeTree.gen.ts"),
		}),
		react(),
		tailwindcss(),
		engineCheck(),
		webAppManifest(),
		// Serve sql-wasm.wasm at any path ending in /sql-wasm.wasm during dev.
		// jeep-sqlite resolves the path relative to its own script URL, which
		// can vary, so we intercept all requests for this filename.
		{
			name: "serve-sql-wasm",
			configureServer(server) {
				server.middlewares.use((req, res, next) => {
					if (req.url?.endsWith("sql-wasm.wasm")) {
						res.setHeader("Content-Type", "application/wasm");
						fs.createReadStream(wasmFile).pipe(res);
						return;
					}
					next();
				});
			},
		},
	],
	root: "./src",
	envDir: "..",
	// publicDir is relative to root (./src) → apps/capacitor/public
	// sql-wasm.wasm lives at public/assets/sql-wasm.wasm for production builds
	publicDir: "../public",
	// The e2e run's server (E2E_SERVER, set by playwright.config.ts) bundles every
	// dependency up front and doesn't hot-reload: a dependency found mid-run, or a
	// file saved during one, would reload every open page and fail its test.
	optimizeDeps: {
		// Pre-bundling moves the package away from its sqlite3.wasm, which it finds by its own URL.
		exclude: ["@sqlite.org/sqlite-wasm"],
		...(process.env.E2E_SERVER
			? { entries: ["**/*.{ts,tsx}", "!**/__tests__/**", "!**/*.test.*"] }
			: {}),
	},
	worker: { format: "es" },
	server: {
		port: 3001,
		open: true,
		host: true,
		hmr: process.env.E2E_SERVER ? false : undefined,
	},
	build: {
		outDir: "../dist",
		minify: false,
		emptyOutDir: true,
	},
	// Vitest uses this. `root: __dirname` overrides the dev-server `root: "./src"`
	// above so test resolution is anchored at apps/capacitor/, not apps/capacitor/src.
	// Live (network-touching) tests are excluded here and run via `pnpm test:live`
	// against `vitest.live.config.ts`.
	test: {
		root: __dirname,
		environment: "happy-dom",
		globals: true,
		include: ["src/**/*.{test,spec}.{ts,tsx}"],
		exclude: ["**/node_modules/**", "**/*.live.test.ts"],
		setupFiles: ["src/test/setup.ts"],
	},
});
