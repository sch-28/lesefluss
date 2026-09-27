import { checkLimit, type RateLimitOptions } from "~/lib/rate-limit";
import { SocialError } from "./errors";

export function rateLimited(key: string, options: RateLimitOptions): Response | null {
	const { ok, retryAfter } = checkLimit(key, options);
	if (ok) return null;
	return Response.json(
		{ error: "Too many requests", reason: "rate_limited" },
		{ status: 429, headers: retryAfter ? { "Retry-After": String(retryAfter) } : undefined },
	);
}

export function socialErrorResponse(err: unknown): Response {
	if (err instanceof SocialError) {
		return Response.json(
			{ error: err.code, reason: err.code, retryAfterDays: err.retryAfterDays },
			{ status: err.status },
		);
	}
	throw err;
}

export async function parseJsonBody(request: Request): Promise<unknown> {
	try {
		return await request.json();
	} catch {
		return null;
	}
}

export function invalidPayloadResponse(): Response {
	return Response.json({ error: "Invalid payload", reason: "invalid" }, { status: 400 });
}

export const AVATAR_RATE_LIMIT: RateLimitOptions = { max: 10, windowMs: 10 * 60_000 };
