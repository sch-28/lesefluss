import { useMutation, useQueryClient } from "@tanstack/react-query";
import { removeBook } from "../../book-import";
import { scheduleSyncPush, wipeServerSessions } from "../../sync";
import { queries } from "../queries";
import {
	bookKeys,
	glossaryKeys,
	readingSessionKeys,
	serialKeys,
	statsKeys,
} from "./query-keys";

/**
 * Bulk-delete every highlight on this device. Sync push then tombstones any
 * server-side rows the payload omits, propagating the deletion to other devices.
 */
function useDeleteAllHighlights() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: () => queries.deleteAllHighlights(),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: bookKeys.all });
			scheduleSyncPush();
		},
	});
}

/**
 * Bulk-delete every glossary entry on this device, including global entries
 * (`bookId IS NULL`). Server-side cleanup happens via diff-on-push.
 */
function useDeleteAllGlossary() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: () => queries.deleteAllEntries(),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: glossaryKeys.all });
			qc.invalidateQueries({ queryKey: bookKeys.all });
			scheduleSyncPush();
		},
	});
}

/**
 * Wipe reading sessions both locally and on the server. Sessions are
 * append-only with no tombstone column, so a dedicated server endpoint deletes
 * the user's rows; otherwise the next pull would re-create them locally.
 */
function useDeleteAllReadingSessions() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async () => {
			await wipeServerSessions();
			await queries.deleteAllReadingSessions();
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: readingSessionKeys.all });
			qc.invalidateQueries({ queryKey: statsKeys.all });
		},
	});
}

/**
 * Tombstone every series + book. Series deletion hard-deletes their chapter
 * rows locally and tombstones the series row; standalone books are soft-deleted
 * via `removeBook` so their files on disk get cleaned up too. Sync propagates
 * the tombstones to the cloud.
 */
async function deleteLibrary(): Promise<void> {
	const seriesList = await queries.getSeriesList();
	for (const s of seriesList) {
		await queries.deleteSeries(s.id);
	}
	const standalone = await queries.getBooks();
	for (const book of standalone) {
		await removeBook({ id: book.id, filePath: book.filePath });
	}
}

function useDeleteLibrary() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: deleteLibrary,
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: bookKeys.all });
			qc.invalidateQueries({ queryKey: bookKeys.covers });
			qc.invalidateQueries({ queryKey: serialKeys.all });
			qc.invalidateQueries({ queryKey: glossaryKeys.all });
			scheduleSyncPush();
		},
	});
}

/**
 * Run every danger-zone deletion in sequence. Preserves auth, settings, and
 * device records. Order: stats first (server endpoint), then content rows so a
 * partial failure leaves a consistent local state.
 */
async function deleteEverything(): Promise<void> {
	await wipeServerSessions();
	await queries.deleteAllReadingSessions();
	await queries.deleteAllHighlights();
	await queries.deleteAllEntries();
	await deleteLibrary();
}

function useDeleteEverything() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: deleteEverything,
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: bookKeys.all });
			qc.invalidateQueries({ queryKey: bookKeys.covers });
			qc.invalidateQueries({ queryKey: serialKeys.all });
			qc.invalidateQueries({ queryKey: glossaryKeys.all });
			qc.invalidateQueries({ queryKey: readingSessionKeys.all });
			qc.invalidateQueries({ queryKey: statsKeys.all });
			scheduleSyncPush();
		},
	});
}

export const dangerZoneHooks = {
	useDeleteAllHighlights,
	useDeleteAllGlossary,
	useDeleteAllReadingSessions,
	useDeleteLibrary,
	useDeleteEverything,
};
