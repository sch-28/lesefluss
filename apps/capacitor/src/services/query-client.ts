import { QueryClient } from "@tanstack/react-query";

/**
 * Singleton QueryClient.
 *
 * Imported by:
 *   - App.tsx → passed to <QueryClientProvider>
 *   - Non-React callers that need to invalidate queries after a mutation
 *     (e.g. if a service function writes to the DB outside of a hook).
 *
 * Default options:
 *   staleTime: Infinity  - SQLite is local; data never goes stale on its own.
 *                          Refetches only happen on explicit invalidation.
 *   retry: false         - DB failures are not transient; don't hammer a broken DB.
 *   gcTime: Infinity     - keep cached data forever (no background eviction).
 *                          Fine for a small local dataset.
 */
export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: Number.POSITIVE_INFINITY,
			gcTime: Number.POSITIVE_INFINITY,
			retry: false,
		},
	},
});
