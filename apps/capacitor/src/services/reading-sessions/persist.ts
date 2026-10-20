import { publishSessionPersist } from "../../test-hooks/reader";
import { log } from "../../utils/log";
import { readingSessionKeys, statsKeys } from "../db/hooks/query-keys";
import { queries } from "../db/queries";
import { queryClient } from "../query-client";
import { scheduleSyncPush } from "../sync";
import type { PersistKind, SessionRow } from "./rules";

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
		})
		.catch((err) => log.error("reading-session", `${kind} failed:`, err));
}
