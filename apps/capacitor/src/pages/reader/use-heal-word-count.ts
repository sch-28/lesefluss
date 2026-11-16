import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { bookKeys } from "../../services/db/hooks/query-keys";
import { queries } from "../../services/db/queries";
import { log } from "../../utils/log";

/** A stored 0 means "never counted" (books imported before v1.4.0), not an empty book. */
export function bookWordTotal(stored: number | undefined, indexed: number | undefined): number {
	return stored || indexed || 0;
}

/**
 * Persists the open book's counted words when its row still holds 0. The
 * startup backfill may not have reached it yet, and goals and stats read the
 * stored column.
 */
export function useHealWordCount(
	id: string,
	stored: number | undefined,
	indexed: number | undefined,
): void {
	const qc = useQueryClient();
	useEffect(() => {
		if (stored !== 0 || !indexed) return;
		void queries
			.setMissingWordCount(id, indexed)
			// Exact keys: the prefix would also reload the open book's content and word index.
			.then(() =>
				Promise.all([
					qc.invalidateQueries({ queryKey: bookKeys.detail(id), exact: true }),
					qc.invalidateQueries({ queryKey: bookKeys.all, exact: true }),
				]),
			)
			.catch((err) => log.warn("reader", "word count heal failed:", err));
	}, [id, stored, indexed, qc]);
}
