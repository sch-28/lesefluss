import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "happy-dom",
	},
	resolve: {
		alias: {
			"~": new URL("./src", import.meta.url).pathname,
		},
	},
});
