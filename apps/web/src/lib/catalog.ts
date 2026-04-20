const DEFAULT_CATALOG_URL = "https://catalog.lesefluss.app";

export function catalogBase(): string {
	return (process.env.CATALOG_URL || DEFAULT_CATALOG_URL).replace(/\/+$/, "");
}

type CatalogFetchResult = { ok: true; data: Response; base: string } | { ok: false; error: string };

type CatalogFetchOptions = Omit<RequestInit, "headers" | "signal"> & {
	/** Plain-object headers only — tuple arrays and Headers instances are not accepted. */
	headers?: Record<string, string>;
	/** "admin" attaches CATALOG_ADMIN_SECRET as a bearer. "public" sends no auth. */
	auth?: "admin" | "public";
	/** Request timeout in ms. Defaults to 5000. */
	timeoutMs?: number;
};

/**
 * Shared HTTP wrapper for the catalog service. Handles base URL resolution,
 * bearer auth for admin endpoints, timeouts, and error coercion so callers
 * can do a single `if (!r.ok)` check instead of wrapping every fetch in
 * try/catch. The resolved base URL is returned on success so callers that need
 * it (e.g. to build proxy image URLs) don't have to re-resolve it.
 */
export async function catalogFetch(
	path: string,
	opts: CatalogFetchOptions = {},
): Promise<CatalogFetchResult> {
	const { auth = "public", timeoutMs = 5000, headers, ...init } = opts;
	const base = catalogBase();
	const finalHeaders: Record<string, string> = { ...(headers ?? {}) };
	if (auth === "admin") {
		const secret = process.env.CATALOG_ADMIN_SECRET;
		if (!secret) return { ok: false, error: "Catalog admin secret not configured" };
		finalHeaders.Authorization = `Bearer ${secret}`;
	}
	try {
		const res = await fetch(`${base}${path}`, {
			...init,
			headers: finalHeaders,
			signal: AbortSignal.timeout(timeoutMs),
		});
		return { ok: true, data: res, base };
	} catch (err) {
		if (err instanceof DOMException && err.name === "TimeoutError") {
			return { ok: false, error: "Catalog service timed out" };
		}
		return { ok: false, error: "Catalog service unreachable" };
	}
}
