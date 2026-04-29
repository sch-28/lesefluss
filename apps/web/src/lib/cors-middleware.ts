import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { ALLOWED_ORIGINS } from "./allowed-origins";

const ALLOWED_ORIGINS_SET = new Set(ALLOWED_ORIGINS);

/**
 * Middleware that handles CORS for cross-origin requests from the Capacitor app.
 * Handles OPTIONS preflight with 204 and sets CORS headers on all responses —
 * including error responses thrown by downstream middleware (e.g. requireAuth's
 * 401) and 5xx exceptions. Without that, the browser blocks the response with
 * a generic CORS error and the actual status / body is invisible to JS.
 */
export const cors = createMiddleware().server(async ({ next }) => {
	const request = getRequest();
	const origin = request.headers.get("origin");
	const isAllowedOrigin = !!origin && ALLOWED_ORIGINS_SET.has(origin);

	// OPTIONS preflight - short-circuit
	if (request.method === "OPTIONS" && isAllowedOrigin) {
		throw new Response(null, {
			status: 204,
			headers: {
				"Access-Control-Allow-Origin": origin,
				"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
				"Access-Control-Allow-Headers": "Content-Type, Authorization, X-Sync-Have",
				"Access-Control-Allow-Credentials": "true",
				"Access-Control-Max-Age": "86400",
			},
		});
	}

	function decorate(response: Response): void {
		if (!isAllowedOrigin) return;
		response.headers.set("Access-Control-Allow-Origin", origin);
		response.headers.set("Access-Control-Allow-Credentials", "true");
	}

	try {
		const result = await next();
		decorate(result.response);
		return result;
	} catch (err) {
		// Downstream threw — usually a `Response` (e.g. requireAuth's 401), but
		// could be a real exception that bubbles into a 500. In both cases we
		// must still attach CORS headers, otherwise the browser hides the real
		// status behind "No Access-Control-Allow-Origin header is present" and
		// JS sees an opaque TypeError.
		if (err instanceof Response) {
			decorate(err);
			throw err;
		}
		const fallback = new Response(JSON.stringify({ error: "Internal Server Error" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
		decorate(fallback);
		throw fallback;
	}
});
