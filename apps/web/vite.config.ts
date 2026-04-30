import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), "");
	const UMAMI_URL = env.UMAMI_URL ?? "";
	const BETTER_AUTH_URL = env.BETTER_AUTH_URL ?? "";
	const CATALOG_URL = env.CATALOG_URL || "https://catalog.lesefluss.app";
	const sentryDsn = env.VITE_SENTRY_DSN || env.SENTRY_DSN || "";
	let sentryOrigin = "";
	try {
		sentryOrigin = sentryDsn ? new URL(sentryDsn).origin : "";
	} catch {
		sentryOrigin = "";
	}

	// BETTER_AUTH_URL is same-origin in prod (covered by 'self') but differs in dev
	// (e.g. http://localhost:3000 while the page is loaded from another host) - listing
	// it keeps auth calls allowed in both environments.
	// /app/* needs wasm-unsafe-eval + unsafe-eval for sql.js; kept separate to stay strict on main site.
	function buildCsp(scriptExtra = "") {
		return [
			"default-src 'self'",
			`script-src 'self' 'unsafe-inline'${scriptExtra}${UMAMI_URL ? ` ${UMAMI_URL}` : ""}`,
			"style-src 'self' 'unsafe-inline'",
			`img-src 'self' data: blob:${CATALOG_URL ? ` ${CATALOG_URL}` : ""}`,
			"font-src 'self' data:",
			"media-src 'self'",
			`connect-src 'self'${UMAMI_URL ? ` ${UMAMI_URL}` : ""}${BETTER_AUTH_URL ? ` ${BETTER_AUTH_URL}` : ""}${CATALOG_URL ? ` ${CATALOG_URL}` : ""}${sentryOrigin ? ` ${sentryOrigin}` : ""}`,
			"frame-ancestors 'none'",
			"base-uri 'self'",
			"form-action 'self'",
		].join("; ");
	}

	const csp = buildCsp();
	const appCsp = buildCsp(" 'wasm-unsafe-eval' 'unsafe-eval'");

	const securityHeaders = {
		"strict-transport-security": "max-age=31536000; includeSubDomains",
		"x-content-type-options": "nosniff",
		"x-frame-options": "DENY",
		"referrer-policy": "strict-origin-when-cross-origin",
		"permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
		"content-security-policy": csp,
	};

	const appSecurityHeaders = {
		...securityHeaders,
		"content-security-policy": appCsp,
	};

	return {
		server: {
			port: 3000,
		},
		resolve: {
			tsconfigPaths: true,
		},
		plugins: [
			tailwindcss(),
			tanstackStart({
				srcDirectory: "src",
			}),
			viteReact(),
			nitro({
				preset: "node-server",
				routeRules: {
					"/**": { headers: securityHeaders },
					"/app/**": { headers: appSecurityHeaders },
				},
			}),
		],
	};
});
