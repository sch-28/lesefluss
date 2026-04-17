import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

const GOATCOUNTER_URL = process.env.GOATCOUNTER_URL ?? "";
const BETTER_AUTH_URL = process.env.BETTER_AUTH_URL ?? "";

// BETTER_AUTH_URL is same-origin in prod (covered by 'self') but differs in dev
// (e.g. http://localhost:3000 while the page is loaded from another host) — listing
// it keeps auth calls allowed in both environments.
const csp = [
	"default-src 'self'",
	`script-src 'self' 'unsafe-inline'${GOATCOUNTER_URL ? ` ${GOATCOUNTER_URL}` : ""}`,
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data: blob:",
	"font-src 'self' data:",
	"media-src 'self'",
	`connect-src 'self'${GOATCOUNTER_URL ? ` ${GOATCOUNTER_URL}` : ""}${BETTER_AUTH_URL ? ` ${BETTER_AUTH_URL}` : ""}`,
	"frame-ancestors 'none'",
	"base-uri 'self'",
	"form-action 'self'",
].join("; ");

const securityHeaders = {
	"strict-transport-security": "max-age=31536000; includeSubDomains",
	"x-content-type-options": "nosniff",
	"x-frame-options": "DENY",
	"referrer-policy": "strict-origin-when-cross-origin",
	"permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
	"content-security-policy": csp,
};

export default defineConfig({
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
			},
		}),
	],
});
