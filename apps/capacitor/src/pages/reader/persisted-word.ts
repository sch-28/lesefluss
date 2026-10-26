/**
 * The word a book's DB row holds, as far as the open reader knows: the seeded
 * word, one a device wrote behind the reader, or the last one whose write is in
 * flight. Writing that word again would only stamp a new updatedAt, the
 * position's last-write-wins revision.
 *
 * Each write takes a token, so a failed write forgets the word only while no
 * later write or seed has replaced it.
 */
export type PersistedWord = {
	get(): number | null;
	/** The row's word as read or written by someone else (seed, BLE device), or null to reset. */
	set(word: number | null): void;
	needsWrite(word: number): boolean;
	/** Records a write of `word` about to start; pass the token to `fail` if it does. */
	begin(word: number): number;
	/** The write failed: a later flush of its word must write again. */
	fail(token: number): void;
};

export function createPersistedWord(): PersistedWord {
	let word: number | null = null;
	let token = 0;
	return {
		get: () => word,
		set(next) {
			word = next;
			token++;
		},
		needsWrite: (next) => next !== word,
		begin(next) {
			word = next;
			return ++token;
		},
		fail(failed) {
			if (failed === token) word = null;
		},
	};
}
