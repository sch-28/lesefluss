import fs from "node:fs";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// IMPORTANT: must be sql.js@1.11.0 — jeep-sqlite@2.8.0 was compiled against that
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
if (!wasmFile) throw new Error("sql-wasm.wasm (1.11.0) not found — run pnpm setup:web");

export default defineConfig({
	base: process.env.WEB_BUILD ? "/app/" : "/",
	plugins: [
		react(),
		tailwindcss(),
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
});
