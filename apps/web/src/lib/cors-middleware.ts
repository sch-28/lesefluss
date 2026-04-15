import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { ALLOWED_ORIGINS } from "./allowed-origins";

const ALLOWED_ORIGINS_SET = new Set(ALLOWED_ORIGINS);

/**
 * Middleware that handles CORS for cross-origin requests from the Capacitor app.
 * Handles OPTIONS preflight with 204 and sets CORS headers on all responses.
 */
export const cors = createMiddleware().server(async ({ next }) => {
	const request = getRequest();
	const origin = request.headers.get("origin");

	// OPTIONS preflight — short-circuit
	if (request.method === "OPTIONS" && origin && ALLOWED_ORIGINS_SET.has(origin)) {
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

	const result = await next();

	// Set CORS headers on the actual response
	if (origin && ALLOWED_ORIGINS_SET.has(origin)) {
		result.response.headers.set("Access-Control-Allow-Origin", origin);
		result.response.headers.set("Access-Control-Allow-Credentials", "true");
	}

	return result;
});
