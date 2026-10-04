import type { z } from "zod";
import { checkLimit, type RateLimitOptions } from "~/lib/rate-limit";
import { isUuid } from "~/lib/uuid";
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

/** A client-supplied IANA zone, or undefined when it is missing or unknown to this runtime. */
export function validTimeZone(raw: string | null): string | undefined {
	if (!raw || raw.length > 64) return undefined;
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: raw });
		return raw;
	} catch {
		return undefined;
	}
}

/** Counted per user: the bucket is `${key}:${userId}`. */
export type RouteLimit = { key: string } & RateLimitOptions;

type HandlerContext = {
	request: Request;
	context: { user: { id: string }; session: { id: string } };
};

type RunResult = Promise<unknown>;

async function respond(run: () => RunResult): Promise<Response> {
	try {
		const result = await run();
		if (result instanceof Response) return result;
		return Response.json(result === undefined ? { ok: true } : result);
	} catch (err) {
		return socialErrorResponse(err);
	}
}

/**
 * A route handler with the per-user limit and error mapping. `run` may return a
 * `Response` (sent as is), `undefined` (sent as `{ ok: true }`) or any other
 * value (sent as JSON); a thrown `SocialError` becomes its error response.
 */
export function socialAction(options: {
	limit: RouteLimit;
	run: (userId: string, request: Request, sessionId: string) => RunResult;
}) {
	return async ({ request, context }: HandlerContext): Promise<Response> => {
		const userId = context.user.id;
		const limited = rateLimited(`${options.limit.key}:${userId}`, options.limit);
		if (limited) return limited;
		return respond(() => options.run(userId, request, context.session.id));
	};
}

/** A POST handler whose JSON body must match `schema`, or the request is answered 400. */
export function socialPost<S extends z.ZodType>(options: {
	limit: RouteLimit;
	schema: S;
	run: (userId: string, body: z.output<S>, sessionId: string) => RunResult;
}) {
	return socialAction({
		limit: options.limit,
		run: async (userId, request, sessionId) => {
			const parsed = options.schema.safeParse(await parseJsonBody(request));
			if (!parsed.success) return invalidPayloadResponse();
			return options.run(userId, parsed.data, sessionId);
		},
	});
}

/** A GET handler for `?id=<uuid>`; anything else is answered 400. */
export function socialGetById(options: {
	limit: RouteLimit;
	run: (userId: string, id: string) => RunResult;
}) {
	return socialAction({
		limit: options.limit,
		run: async (userId, request) => {
			const id = new URL(request.url).searchParams.get("id") ?? "";
			if (!isUuid(id)) return invalidPayloadResponse();
			return options.run(userId, id);
		},
	});
}
