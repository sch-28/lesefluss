import { useMutation, useQueryClient } from "@tanstack/react-query";
import type React from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "../components/toast";
import BookEditSheet, {
	type BookEditValues,
	clampToFieldLimits,
	editValuesToPatch,
} from "../pages/library/book-edit-sheet";
import { commitStagedImport, type StagedImport } from "../services/book-import";
import { bookKeys } from "../services/db/hooks/query-keys";
import { pushBackHandler } from "../services/overlay-back";
import { scheduleSyncPush } from "../services/sync";
import { log } from "../utils/log";

type ImportStaging = {
	/** Queue a parsed book for confirmation. Nothing is written until the reader
	 *  confirms it. */
	stage: (staged: StagedImport) => void;
};

const ImportStagingContext = createContext<ImportStaging | null>(null);

/**
 * Holds parsed-but-unwritten imports while the reader confirms them.
 *
 * Mounted at the router root rather than in the library page for two reasons:
 * a share received while the app was closed parses before any page exists, and
 * imports also start from Explore. A page-owned sheet would miss both.
 *
 * A queue rather than a single slot: two imports can land close together (a
 * share arriving while a file is still parsing), and dropping one silently
 * would lose a book the reader asked for.
 */
export const ImportStagingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const [queue, setQueue] = useState<StagedImport[]>([]);
	const current = queue[0] ?? null;
	const qc = useQueryClient();

	const commit = useMutation({
		mutationFn: ({ staged, values }: { staged: StagedImport; values: BookEditValues }) =>
			commitStagedImport(staged, editValuesToPatch(values)),
		onSuccess: (book, { staged }) => {
			// The import only counts as done here, not when parsing finished.
			qc.invalidateQueries({ queryKey: bookKeys.all });
			qc.invalidateQueries({ queryKey: bookKeys.covers });
			scheduleSyncPush();
			// Drop by identity, not position: another import may have queued behind
			// this one while it was being written.
			setQueue((q) => q.filter((entry) => entry !== staged));
			staged.cleanup?.();
			toast.success(`Added "${book.title}"`);
		},
		onError: (error) => {
			log.warn("book-import", "commit failed:", error);
			toast.error("Couldn't save this book");
		},
	});

	// The mutation keeps its variables, and those hold the whole book text plus
	// the original file bytes. Resetting once the queue drains releases them.
	const { reset: resetCommit } = commit;
	useEffect(() => {
		if (queue.length === 0) resetCommit();
	}, [queue.length, resetCommit]);

	const discardCurrent = useCallback(() => {
		setQueue((q) => {
			q[0]?.cleanup?.();
			return q.slice(1);
		});
	}, []);

	// Back closes the sheet instead of navigating the page behind it. Discards
	// the head only, so a queued import still gets its turn.
	useEffect(() => {
		if (!current) return;
		return pushBackHandler(() => {
			if (commit.isPending) return true;
			discardCurrent();
			return true;
		});
	}, [current, commit.isPending, discardCurrent]);

	const value = useMemo<ImportStaging>(
		() => ({ stage: (staged) => setQueue((q) => [...q, staged]) }),
		[],
	);

	// Seeded from the parse, so the reader corrects what the parser guessed
	// rather than filling in a blank form. Clamped because the seed is file
	// metadata: an EPUB can carry a megabyte-long title, and the sheet's
	// maxLength only bounds what the reader types, not what it starts with.
	const initial = useMemo<BookEditValues | null>(
		() =>
			current
				? clampToFieldLimits({
						title: current.payload.title,
						author: current.payload.author ?? null,
						description: null,
						language: null,
						status: null,
						rating: null,
						review: null,
						tags: [],
					})
				: null,
		[current],
	);

	return (
		<ImportStagingContext.Provider value={value}>
			{children}
			{current && initial && (
				<BookEditSheet
					isOpen
					onClose={() => {
						// A dismiss mid-write would leave the book saved with no sign of
						// it, so the drawer only closes once the write is done.
						if (commit.isPending) return;
						discardCurrent();
					}}
					initial={initial}
					title="Add book"
					saveLabel="Add to library"
					isSaving={commit.isPending}
					onSave={(values) => commit.mutate({ staged: current, values })}
				/>
			)}
		</ImportStagingContext.Provider>
	);
};

export function useImportStaging(): ImportStaging {
	const context = useContext(ImportStagingContext);
	if (!context) throw new Error("useImportStaging must be used within ImportStagingProvider");
	return context;
}
