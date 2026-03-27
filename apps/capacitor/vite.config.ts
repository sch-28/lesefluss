import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react()],
	root: "./src",
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
