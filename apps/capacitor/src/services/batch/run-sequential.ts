/**
 * Run a list of items through an async operation, one at a time.
 *
 * Sequential on purpose. The callers here either hold a whole book in memory
 * while they work (folder import) or write through a single SQLite bridge that
 * serialises anyway (bulk library actions), so concurrency buys nothing and
 * doubles peak memory.
 *
 * The contract that matters: one item failing never abandons the rest, and the
 * caller learns which items failed and why. A hand-rolled loop without a
 * per-item catch stops at the first throw and reports nothing.
 */

export type SequentialProgress = {
	/** Items finished, successfully or not. */
	done: number;
	total: number;
	current: string;
};

export type SequentialFailure<T> = { item: T; reason: string };

/** Nothing running. */
export const NO_PROGRESS: SequentialProgress = { done: 0, total: 0, current: "" };

export type SequentialResult<T> = {
	succeeded: number;
	failures: SequentialFailure<T>[];
	/** True when a cancel stopped the run before every item was tried. */
	cancelled: boolean;
};

export type RunSequentialOptions<T> = {
	items: readonly T[];
	run: (item: T) => Promise<unknown>;
	/** What the progress line shows while this item is being worked on. */
	label: (item: T) => string;
	/** Reader-facing reason for one failure. */
	describeError: (err: unknown) => string;
	onProgress?: (progress: SequentialProgress) => void;
	/** Checked between items: the in-flight one always finishes and stays written. */
	isCancelled?: () => boolean;
};

export async function runSequential<T>({
	items,
	run,
	label,
	describeError,
	onProgress,
	isCancelled,
}: RunSequentialOptions<T>): Promise<SequentialResult<T>> {
	const failures: SequentialFailure<T>[] = [];
	let succeeded = 0;

	for (const [index, item] of items.entries()) {
		if (isCancelled?.()) return { succeeded, failures, cancelled: true };

		onProgress?.({ done: index, total: items.length, current: label(item) });
		try {
			await run(item);
			succeeded += 1;
		} catch (err) {
			failures.push({ item, reason: describeError(err) });
		}
	}

	onProgress?.({ done: items.length, total: items.length, current: "" });
	return { succeeded, failures, cancelled: false };
}
