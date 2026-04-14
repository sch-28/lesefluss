import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { auth } from "./auth";

/**
 * Server function that returns the current session.
 * Use in route loaders to protect pages server-side.
 *
 * @example
 * loader: async () => {
 *   const session = await getSession()
 *   if (!session) throw redirect({ to: '/login' })
 *   return { user: session.user }
 * }
 */
export const getSession = createServerFn({ method: "GET" }).handler(async () => {
	const request = getRequest();
	return auth.api.getSession({ headers: request.headers });
});
