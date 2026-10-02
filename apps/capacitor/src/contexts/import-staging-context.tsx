import { useMutation, useQueryClient } from "@tanstack/react-query";
import type React from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "../components/toast";
import BookEditSheet, {
	type BookEditValues,
	clampToFieldLimits,
	editValuesToPatch,
} from "../pages/library/book-edit-sheet";
import {
	attachOriginalToBook,
	commitStagedImport,
	findAttachCandidate,
	type StagedImport,
} from "../services/book-import";
import { bookKeys } from "../services/db/hooks/query-keys";
import type { Book } from "../services/db/schema";
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

	// Keyed to the import it was found for: when the queue advances, the render
	// before the lookup effect reruns must not pair the next file with this
	// book. Until the lookup settles the sheet shows "checking" and saving is
	// off, since a save meanwhile would create the duplicate the offer prevents.
	const [lookup, setLookup] = useState<{ staged: StagedImport; book: Book | null } | null>(null);
	useEffect(() => {
		if (!current) return;
		let stale = false;
		findAttachCandidate(current.payload).then(
			(book) => {
				if (!stale) setLookup({ staged: current, book });
			},
			(error) => {
				log.warn("book-import", "attach lookup failed:", error);
				if (!stale) setLookup({ staged: current, book: null });
			},
		);
		return () => {
			stale = true;
		};
	}, [current]);
	const isCheckingAttach = !!current && lookup?.staged !== current;
	const attachCandidate = isCheckingAttach ? null : (lookup?.book ?? null);

	const attach = useMutation({
		mutationFn: ({ staged, book }: { staged: StagedImport; book: Book }) =>
			attachOriginalToBook(book, staged.payload),
		onSuccess: ({ fileCopyFailed }, { staged, book }) => {
			// Exact keys: the book's content is unchanged and its anchors are already
			// patched, so the open reader must not re-read the whole text.
			qc.invalidateQueries({ queryKey: bookKeys.all, exact: true });
			qc.invalidateQueries({ queryKey: bookKeys.detail(book.id), exact: true });
			setQueue((q) => q.filter((entry) => entry !== staged));
			staged.cleanup?.();
			if (fileCopyFailed) {
				toast.error(`Attached to "${book.title}", but the file couldn't be kept`);
			} else {
				toast.success(`Attached to "${book.title}"`);
			}
		},
		onError: (error) => {
			log.warn("book-import", "attach failed:", error);
			toast.error("Couldn't attach this file");
		},
	});

	const isBusy = commit.isPending || attach.isPending;

	// The mutations keep their variables, and those hold the whole book text
	// plus the original file bytes. Resetting once the queue drains releases them.
	const { reset: resetCommit } = commit;
	const { reset: resetAttach } = attach;
	useEffect(() => {
		if (queue.length === 0) {
			resetCommit();
			resetAttach();
		}
	}, [queue.length, resetCommit, resetAttach]);

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
			if (isBusy) return true;
			discardCurrent();
			return true;
		});
	}, [current, isBusy, discardCurrent]);

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
						// Same precedence the commit step applies when no sheet is shown,
						// so the seed is what would be stored either way. The sheet's
						// value wins outright there, so a null seed would discard the
						// file's own dc:language and leave every lookup on the default
						// chain.
						language: current.extras.language ?? current.payload.language ?? null,
						status: null,
						rating: null,
						review: null,
						tags: [],
						hideFromProfile: false,
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
						if (isBusy) return;
						discardCurrent();
					}}
					initial={initial}
					title="Add book"
					saveLabel="Add to library"
					isSaving={commit.isPending}
					onSave={(values) => commit.mutate({ staged: current, values })}
					isCheckingAlternative={isCheckingAttach}
					alternativeAction={
						attachCandidate
							? {
									hint: attachHint(attachCandidate.title, current.payload),
									label: "Attach",
									isPending: attach.isPending,
									onSelect: () => attach.mutate({ staged: current, book: attachCandidate }),
								}
							: undefined
					}
				/>
			)}
		</ImportStagingContext.Provider>
	);
};

function attachHint(title: string, payload: StagedImport["payload"]): string {
	const gain = payload.images?.length
		? "add its images and keep your progress"
		: "keep your progress instead of adding a copy";
	return `Already in your library as "${title}". Attach this file to ${gain}.`;
}

export function useImportStaging(): ImportStaging {
	const context = useContext(ImportStagingContext);
	if (!context) throw new Error("useImportStaging must be used within ImportStagingProvider");
	return context;
}
