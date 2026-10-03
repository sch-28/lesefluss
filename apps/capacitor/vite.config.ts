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
			telemetryUrl = syncUrl ? `${syncUrl}/api/telemetry` : "";
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

export default defineConfig({
	base: process.env.WEB_BUILD ? "/app/" : "/",
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
	server: {
		port: 3001,
		open: true,
		host: true,
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
