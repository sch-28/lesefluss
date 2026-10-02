/**
 * A request that never got an HTTP response: no connection, DNS failure,
 * timeout. Distinct from an error status, so UI can say "check your
 * connection" instead of "something went wrong". `fetch` signals the same
 * thing with a TypeError; the native HTTP plugin rejects with plain Errors,
 * so its failures are wrapped in this.
 */
export class NetworkError extends Error {
	readonly cause: unknown;

	constructor(message = "FETCH_FAILED", options?: { cause?: unknown }) {
		super(message);
		this.name = "NetworkError";
		this.cause = options?.cause;
	}
}

export function isNetworkError(error: unknown): boolean {
	return error instanceof NetworkError || error instanceof TypeError;
}
