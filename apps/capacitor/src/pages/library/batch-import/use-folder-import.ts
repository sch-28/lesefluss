import type { BookFileFormat } from "@lesefluss/book-import";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "../../../components/toast";
import {
	type SequentialProgress as BatchProgress,
	NO_PROGRESS,
} from "../../../services/batch/run-sequential";
import { importScannedFile, pickBookFolder, probeScannedFile } from "../../../services/book-import";
import { bookKeys } from "../../../services/db/hooks/query-keys";
import { scheduleSyncPush } from "../../../services/sync";
import { log } from "../../../utils/log";
import { ALERT_SUPPRESSED, ERROR_TOASTS } from "../import-errors";
import {
	applyProbe,
	type Candidate,
	candidateKey,
	type FormatCount,
	formatCounts,
	isDuplicate,
	normalizeTitle,
	setSelection,
	toCandidates,
	toggleCandidate,
} from "./candidates";
import { type BatchResult, runBatchImport } from "./run-import";

export type FolderImportPhase = "idle" | "scanning" | "review" | "importing" | "done";

type UseFolderImport = {
	phase: FolderImportPhase;
	candidates: Candidate[];
	formats: FormatCount[];
	selectedCount: number;
	/** Files still waiting to be probed; 0 once every card is filled in. */
	pendingProbes: number;
	/** The scan stopped at its ceiling, so the folder holds more than this. */
	truncated: boolean;
	progress: BatchProgress;
	result: BatchResult | null;
	duplicateKeys: ReadonlySet<string>;
	start: () => void;
	toggle: (key: string) => void;
	selectAll: (selected: boolean, format?: BookFileFormat) => void;
	beginImport: () => void;
	cancelImport: () => void;
	close: () => void;
};

/**
 * Drives a folder import from picker to library.
 *
 * `existingTitles` comes from the caller's already-loaded library, so duplicate
 * detection costs no extra query.
 */
export function useFolderImport(
	existingTitles: ReadonlySet<string>,
	onClose: () => void,
): UseFolderImport {
	const qc = useQueryClient();
	const [phase, setPhase] = useState<FolderImportPhase>("idle");
	const [candidates, setCandidates] = useState<Candidate[]>([]);
	const [pendingProbes, setPendingProbes] = useState(0);
	const [truncated, setTruncated] = useState(false);
	const [progress, setProgress] = useState<BatchProgress>(NO_PROGRESS);
	const [result, setResult] = useState<BatchResult | null>(null);

	// Probing and importing both outlive a render, and both must stop when the
	// sheet goes away rather than keep reading files into a dead component.
	const abortRef = useRef(false);
	const cancelImportRef = useRef(false);
	// Probing yields to the import run. Both read whole files, so letting them
	// overlap would hold two books in memory at once, which is the peak the
	// sequential runner exists to avoid.
	const probesPausedRef = useRef(false);
	useEffect(() => {
		abortRef.current = false;
		return () => {
			abortRef.current = true;
		};
	}, []);

	const titlesRef = useRef(existingTitles);
	titlesRef.current = existingTitles;

	const probeAll = useCallback(async (files: Candidate[]) => {
		let remaining = files.length;
		setPendingProbes(remaining);
		for (const candidate of files) {
			if (abortRef.current || probesPausedRef.current) return;
			const key = candidateKey(candidate);
			try {
				const probe = await probeScannedFile(candidate.file);
				if (abortRef.current || probesPausedRef.current) return;
				setCandidates((current) => applyProbe(current, key, probe, titlesRef.current));
			} catch (err) {
				// A probe failure only costs this card its cover and real title; the
				// file can still be imported, and the import reports its own errors.
				log.warn("book-import", `probe failed for ${key}:`, err);
			}
			remaining -= 1;
			setPendingProbes(remaining);
		}
	}, []);

	const start = useCallback(async () => {
		setPhase("scanning");
		setResult(null);
		setProgress(NO_PROGRESS);
		try {
			const scan = await pickBookFolder();
			if (abortRef.current) return;
			if (scan.files.length === 0) {
				toast.warning("No books found in that folder");
				onClose();
				setPhase("idle");
				return;
			}
			const found = toCandidates(scan.files);
			setTruncated(scan.truncated);
			setCandidates(found);
			setPhase("review");
			probeAll(found);
		} catch (err) {
			setPhase("idle");
			onClose();
			if (!(err instanceof Error)) return;
			const entry = ERROR_TOASTS[err.message];
			if (entry) toast.warning(entry.msg);
			else if (!ALERT_SUPPRESSED.has(err.message)) toast.error("Couldn't scan that folder");
		}
	}, [onClose, probeAll]);

	const beginImport = useCallback(async () => {
		const selected = candidates.filter((candidate) => candidate.selected).map((c) => c.file);
		if (selected.length === 0) return;

		cancelImportRef.current = false;
		// Stop probing before the first file is read. Cards still waiting keep
		// their filenames, which is the right trade against holding two books.
		probesPausedRef.current = true;
		setPendingProbes(0);
		setPhase("importing");
		const batch = await runBatchImport({
			files: selected,
			importFile: importScannedFile,
			onProgress: setProgress,
			isCancelled: () => cancelImportRef.current || abortRef.current,
		});

		// Once per run, not once per book: a folder of forty would otherwise fire
		// forty refetches and forty sync pushes.
		if (batch.imported > 0) {
			qc.invalidateQueries({ queryKey: bookKeys.all });
			qc.invalidateQueries({ queryKey: bookKeys.covers });
			scheduleSyncPush();
		}

		if (abortRef.current) return;
		setResult(batch);
		setPhase("done");
	}, [candidates, qc]);

	const cancelImport = useCallback(() => {
		cancelImportRef.current = true;
	}, []);

	const close = useCallback(() => {
		abortRef.current = true;
		onClose();
	}, [onClose]);

	const duplicateKeys = useMemo(() => {
		const keys = new Set<string>();
		for (const candidate of candidates) {
			if (isDuplicate(candidate, existingTitles)) keys.add(candidateKey(candidate));
		}
		return keys;
	}, [candidates, existingTitles]);

	return {
		phase,
		candidates,
		formats: useMemo(() => formatCounts(candidates), [candidates]),
		selectedCount: candidates.filter((candidate) => candidate.selected).length,
		pendingProbes,
		truncated,
		progress,
		result,
		duplicateKeys,
		start,
		toggle: useCallback((key: string) => setCandidates((c) => toggleCandidate(c, key)), []),
		selectAll: useCallback(
			(selected: boolean, format?: BookFileFormat) =>
				setCandidates((c) => setSelection(c, selected, format)),
			[],
		),
		beginImport,
		cancelImport,
		close,
	};
}

/** Normalised titles of everything already in the library, for duplicate checks. */
export function toExistingTitles(books: { title: string }[]): ReadonlySet<string> {
	return new Set(books.map((book) => normalizeTitle(book.title)));
}
