/**
 * Generate a random 8-character hex ID for a book.
 * Used as the primary key in sync/local DBs and as book.hash on the ESP32.
 */
export function generateBookId(): string {
	const arr = new Uint8Array(4);
	crypto.getRandomValues(arr);
	return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}
