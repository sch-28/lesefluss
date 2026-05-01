/**
 * 8-char random hex id, generated client-side. Used as the primary key for
 * highlights, reading sessions, and other rows that need a stable identity
 * before they ever reach the server.
 */
export function randomHexId(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(4)))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}
