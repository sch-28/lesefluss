import { existsSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { createFileRoute } from "@tanstack/react-router";
import { getSpaHtml } from "~/lib/spa-html";

const MIME: Record<string, string> = {
	".wasm": "application/wasm",
	".js": "application/javascript",
	".css": "text/css",
	".json": "application/json",
	".svg": "image/svg+xml",
	".png": "image/png",
	".jpg": "image/jpeg",
	".ico": "image/x-icon",
};

function tryServeStatic(pathname: string): Response | null {
	const ext = extname(pathname);
	if (!ext) return null;
	const rel = pathname.startsWith("/") ? pathname.slice(1) : pathname;
	for (const base of [".output/public", "public"]) {
		const filePath = resolve(base, rel);
		if (existsSync(filePath)) {
			return new Response(readFileSync(filePath), {
				headers: {
					"Content-Type": MIME[ext] || "application/octet-stream",
					"Cache-Control": "public, max-age=31536000, immutable",
				},
			});
		}
	}
	return null;
}

export const Route = createFileRoute("/app/$")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const { pathname } = new URL(request.url);
				const staticResponse = tryServeStatic(pathname);
				if (staticResponse) return staticResponse;
				return new Response(getSpaHtml(), {
					headers: { "Content-Type": "text/html; charset=utf-8" },
				});
			},
		},
	},
});
