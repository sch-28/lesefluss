/**
 * 8-char random hex id, generated client-side, for rows that need a stable
 * identity before they ever reach the server. Tables that need fewer
 * collisions use the wider id below.
 */
export function randomHexId(): string {
	return hexId(4);
}

/**
 * 16-char (64-bit) id for reading sessions. Sessions are capped at 50k rows per
 * account, where 32 bits carries roughly a 25% chance that some pair collides —
 * and a collision is silent, because both the local upsert and the server's
 * `(userId, sessionId)` conflict target treat it as the same row. Any table whose
 * server tombstones are sticky needs it too: a new id that matches a deleted one
 * would be deleted on the next pull.
 *
 * Book ids stay 8 chars: the sync schema pins them to `^[0-9a-f]{8}$`.
 */
export function randomSessionId(): string {
	return hexId(8);
}

function hexId(bytes: number): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(bytes)))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}
