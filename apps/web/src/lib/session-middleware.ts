import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { auth } from "./auth";

/**
 * Middleware that requires a valid session.
 * Throws 401 if unauthenticated. Passes { user, session } into handler context.
 *
 * @example
 * server: {
 *   middleware: [requireAuth],
 *   handlers: {
 *     GET: async ({ context }) => {
 *       const { user } = context
 *       // user is guaranteed non-null here
 *     },
 *   },
 * }
 */
export const requireAuth = createMiddleware().server(async ({ next }) => {
	const request = getRequest();
	const session = await auth.api.getSession({ headers: request.headers });

	if (!session?.user) {
		throw new Response(JSON.stringify({ error: "Unauthorized" }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		});
	}

	return next({ context: { user: session.user, session: session.session } });
});
