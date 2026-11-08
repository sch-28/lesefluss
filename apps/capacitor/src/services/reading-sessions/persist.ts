import { statusAfterRealSitting } from "@lesefluss/core";
import { publishSessionPersist } from "../../test-hooks/reader";
import { log } from "../../utils/log";
import { bookKeys, readingSessionKeys, statsKeys } from "../db/hooks/query-keys";
import { queries } from "../db/queries";
import { queryClient } from "../query-client";
import { scheduleSyncPush } from "../sync";
import type { PersistKind, SessionRow } from "./rules";

const sittingsApplied = new Set<string>();

/**
 * A written row is a real sitting (it cleared the noise floor): it records the
 * book's first sitting, which puts an Automatic book on Reading, and moves a
 * stored status on. The position save never waits for or depends on this.
 */
async function applyRealSitting(row: SessionRow): Promise<void> {
	if (sittingsApplied.has(row.id)) return;
	sittingsApplied.add(row.id);
	const book = await queries.getBook(row.bookId);
	if (!book) return;
	const marks = book.firstSittingAt == null || book.firstSittingAt > row.startedAt;
	const status = statusAfterRealSitting(book);
	if (!marks && status === undefined) return;
	if (marks) await queries.markFirstSitting(book.id, row.startedAt);
	if (status !== undefined) await queries.updateBook(book.id, { status });
	queryClient.invalidateQueries({ queryKey: bookKeys.all });
	queryClient.invalidateQueries({ queryKey: statsKeys.all });
	scheduleSyncPush(2000);
}

export function persistRow(row: SessionRow, kind: PersistKind): void {
	queries
		.upsertReadingSession(row)
		.then(() => {
			// Heartbeat checkpoints fire every 30s while reading. The write
			// only touches `reading_sessions`, so book queries don't need to
			// refetch. Stats + session queries feed the stats/library screens
			// (not the reader) and can wait for the sitting-end flush.
			if (kind === "flush") {
				queryClient.invalidateQueries({ queryKey: statsKeys.all });
				queryClient.invalidateQueries({ queryKey: readingSessionKeys.all });
				scheduleSyncPush(2000);
			}
			if (import.meta.env.DEV) publishSessionPersist(row.bookId, kind);
			return applyRealSitting(row);
		})
		.catch((err) => log.error("reading-session", `${kind} failed:`, err));
}
