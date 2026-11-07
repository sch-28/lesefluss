import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useRouterState } from "@tanstack/react-router";
import type React from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "../components/toast";
import {
	type BookEditValues,
	clampToFieldLimits,
	editValuesToPatch,
} from "../pages/library/book-edit-form";
import {
	attachOriginalToBook,
	commitStagedImport,
	findAttachCandidate,
	type StagedImport,
} from "../services/book-import";
import { bookKeys } from "../services/db/hooks/query-keys";
import type { Book } from "../services/db/schema";
import { scheduleSyncPush } from "../services/sync";
import { log } from "../utils/log";

type ImportStaging = {
	/** Queue a parsed book for confirmation. Nothing is written until the reader
	 *  confirms it. */
	stage: (staged: StagedImport) => void;
};

/** What the Add book page shows and does for the head of the queue. */
export type ImportQueue = {
	current: StagedImport | null;
	/** 1-based place of `current` among the imports since the queue was last empty. */
	position: number;
	total: number;
	initial: BookEditValues | null;
	isCheckingAttach: boolean;
	attachCandidate: Book | null;
	attachHint: string | null;
	isCommitting: boolean;
	isAttaching: boolean;
	isBusy: boolean;
	commit: (values: BookEditValues) => void;
	attach: () => void;
	/** Drops the head; a queued import still gets its turn. */
	discard: () => void;
	discardAll: () => void;
};

export const IMPORT_PATH = "/tabs/library/import";

const ImportStagingContext = createContext<ImportStaging | null>(null);
const ImportQueueContext = createContext<ImportQueue | null>(null);

/**
 * Holds parsed-but-unwritten imports while the reader confirms them.
 *
 * Mounted at the router root rather than in the library page for two reasons:
 * a share received while the app was closed parses before any page exists, and
 * imports also start from Explore. A queue owned by the library page would miss both.
 *
 * A queue rather than a single slot: two imports can land close together (a
 * share arriving while a file is still parsing), and dropping one silently
 * would lose a book the reader asked for.
 */
export const ImportStagingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const [queue, setQueue] = useState<StagedImport[]>([]);
	const [handled, setHandled] = useState(0);
	const current = queue[0] ?? null;
	const qc = useQueryClient();
	const router = useRouter();

	const dropEntry = useCallback((staged: StagedImport) => {
		// By identity, not position: another import may have queued behind this
		// one while it was being written.
		setQueue((q) => q.filter((entry) => entry !== staged));
		setHandled((n) => n + 1);
		staged.cleanup?.();
	}, []);

	const commit = useMutation({
		mutationFn: ({ staged, values }: { staged: StagedImport; values: BookEditValues }) =>
			commitStagedImport(staged, editValuesToPatch(values)),
		onSuccess: (book, { staged }) => {
			// The import only counts as done here, not when parsing finished.
			qc.invalidateQueries({ queryKey: bookKeys.all });
			qc.invalidateQueries({ queryKey: bookKeys.covers });
			scheduleSyncPush();
			dropEntry(staged);
			toast.success(`Added "${book.title}"`);
		},
		onError: (error) => {
			log.warn("book-import", "commit failed:", error);
			toast.error("Couldn't save this book");
		},
	});

	// Keyed to the import it was found for: when the queue advances, the render
	// before the lookup effect reruns must not pair the next file with this
	// book. Until the lookup settles the page shows "checking" and saving is
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
			dropEntry(staged);
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
			setHandled(0);
		}
	}, [queue.length, resetCommit, resetAttach]);

	const discard = useCallback(() => {
		if (current) dropEntry(current);
	}, [current, dropEntry]);

	const discardAll = useCallback(() => {
		setQueue((q) => {
			for (const entry of q) entry.cleanup?.();
			return [];
		});
	}, []);

	// The confirm step is a page, so a new import takes the reader there from
	// wherever they are, the reader included: leaving it saves the position on
	// unmount as any other navigation does.
	// Keyed on the path too: a blocker (unsaved edits) can refuse the first
	// redirect, and the next navigation must still bring the queue up.
	const hasQueue = current !== null;
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	useEffect(() => {
		if (hasQueue && pathname !== IMPORT_PATH) {
			void router.navigate({ to: IMPORT_PATH });
		}
	}, [hasQueue, pathname, router]);

	const value = useMemo<ImportStaging>(
		() => ({ stage: (staged) => setQueue((q) => [...q, staged]) }),
		[],
	);

	// Seeded from the parse, so the reader corrects what the parser guessed
	// rather than filling in a blank form. Clamped because the seed is file
	// metadata: an EPUB can carry a megabyte-long title, and the form's
	// maxLength only bounds what the reader types, not what it starts with.
	const initial = useMemo<BookEditValues | null>(
		() =>
			current
				? clampToFieldLimits({
						title: current.payload.title,
						author: current.payload.author ?? null,
						description: null,
						// Same precedence the commit step applies without a confirm step,
						// so the seed is what would be stored either way. The form's
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

	const queueValue: ImportQueue = {
		current,
		position: handled + 1,
		total: handled + queue.length,
		initial,
		isCheckingAttach,
		attachCandidate,
		attachHint:
			current && attachCandidate ? attachHint(attachCandidate.title, current.payload) : null,
		isCommitting: commit.isPending,
		isAttaching: attach.isPending,
		isBusy,
		commit: (values) => {
			if (current) commit.mutate({ staged: current, values });
		},
		attach: () => {
			if (current && attachCandidate) attach.mutate({ staged: current, book: attachCandidate });
		},
		discard,
		discardAll,
	};

	return (
		<ImportStagingContext.Provider value={value}>
			<ImportQueueContext.Provider value={queueValue}>{children}</ImportQueueContext.Provider>
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

export function useImportQueue(): ImportQueue {
	const context = useContext(ImportQueueContext);
	if (!context) throw new Error("useImportQueue must be used within ImportStagingProvider");
	return context;
}
