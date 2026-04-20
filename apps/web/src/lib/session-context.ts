import { useRouteContext } from "@tanstack/react-router";
import type { getSession } from "./get-session";

/** Non-null session shape as returned by `getSession()`. */
export type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>;

/** Read the session resolved by the root route's `beforeLoad`. Returns null if signed out. */
export function useAuthSession(): Session | null {
	return useRouteContext({ from: "__root__" }).session;
}
