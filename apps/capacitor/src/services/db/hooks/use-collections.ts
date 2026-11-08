import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "../../../components/toast";
import type { SeriesPlan } from "../../../pages/library/book-edit-form";
import { log } from "../../../utils/log";
import { applyBookSeriesPlan } from "../../series-collections";
import { scheduleSyncPush } from "../../sync";
import { errorMessage, reportEvent } from "../../telemetry";
import { queries } from "../queries";
import type { CollectionEdit, MembershipOrder } from "../queries/collections";
import { collectionKeys } from "./query-keys";

function useCollections() {
	return useQuery({ queryKey: collectionKeys.all, queryFn: () => queries.getCollections() });
}

function useCollectionBookIds(collectionId: string | null) {
	return useQuery({
		queryKey: collectionKeys.members(collectionId ?? ""),
		queryFn: () => queries.getCollectionBookIds(collectionId ?? ""),
		enabled: collectionId !== null,
	});
}

function useCollectionMemberships() {
	return useQuery({
		queryKey: collectionKeys.memberships,
		queryFn: () => queries.getCollectionMemberships(),
	});
}

function useSeriesMemberships() {
	return useQuery({
		queryKey: collectionKeys.seriesMemberships,
		queryFn: () => queries.getSeriesMemberships(),
	});
}

/** Members with their #N, for the bulk sheet's numbering preview. */
function useCollectionMembers(collectionId: string | null) {
	return useQuery({
		queryKey: collectionKeys.memberRows(collectionId ?? ""),
		queryFn: () => queries.getCollectionMembers(collectionId ?? ""),
		enabled: collectionId !== null,
	});
}

function useCollectionIdsForBook(bookId: string | null) {
	return useQuery({
		queryKey: collectionKeys.ofBook(bookId ?? ""),
		queryFn: () => queries.getCollectionIdsForBook(bookId ?? ""),
		enabled: bookId !== null,
	});
}

function useSeriesMembershipForBook(bookId: string) {
	return useQuery({
		queryKey: collectionKeys.seriesOfBook(bookId),
		queryFn: () => queries.getSeriesMembershipForBook(bookId),
		enabled: bookId !== "",
	});
}

function useImportSeriesState(seriesKey: string | null) {
	return useQuery({
		queryKey: collectionKeys.importSeries(seriesKey ?? ""),
		queryFn: () => queries.getImportSeriesState(seriesKey ?? ""),
		enabled: seriesKey !== null,
	});
}

function useSaveBookSeries() {
	return useCollectionMutation((vars: { bookId: string; plan: SeriesPlan }) =>
		applyBookSeriesPlan(vars.bookId, vars.plan),
	);
}

// LESE-125.19 was a silent no-op on Android that never reproduced on web; the
// telemetry event is how the next occurrence on a no-account device shows its cause.
export function reportCollectionWriteError(err: unknown) {
	log.warn("collections", "collection write failed:", err);
	reportEvent("collection_write_error", { message: errorMessage(err) });
	toast.error("Couldn't save the collection");
}

function useCollectionMutation<T, R>(mutationFn: (vars: T) => Promise<R>) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn,
		// Returned so a caller's own onSuccess (opening a new collection) runs on fresh data.
		onSuccess: () => {
			scheduleSyncPush();
			return qc.invalidateQueries({ queryKey: collectionKeys.all });
		},
		onError: reportCollectionWriteError,
	});
}

function useCreateCollection() {
	return useCollectionMutation((name: string) => queries.createCollection(name));
}

function useCreateCollectionWithBooks() {
	return useCollectionMutation(
		(vars: { name: string; bookIds: readonly string[]; ordered?: boolean }) =>
			queries.createCollectionWithBooks(vars.name, vars.bookIds, { ordered: vars.ordered }),
	);
}

function useEditCollection() {
	return useCollectionMutation((vars: { id: string; edit: CollectionEdit }) =>
		queries.editCollection(vars.id, vars.edit),
	);
}

function useRenameCollection() {
	return useCollectionMutation((vars: { id: string; name: string }) =>
		queries.renameCollection(vars.id, vars.name),
	);
}

function useSetCollectionView() {
	return useCollectionMutation((vars: { id: string; view: string | null }) =>
		queries.setCollectionView(vars.id, vars.view),
	);
}

function useMoveCollection() {
	return useCollectionMutation((vars: { id: string; toIndex: number }) =>
		queries.moveCollection(vars.id, vars.toIndex),
	);
}

function useDeleteCollection() {
	return useCollectionMutation((id: string) => queries.deleteCollection(id));
}

function useAddBooksToCollection() {
	return useCollectionMutation((vars: { collectionId: string; bookIds: string[] }) =>
		queries.addBooksToCollection(vars.collectionId, vars.bookIds),
	);
}

export type NumberedTarget = { collectionId: string } | { newSeries: string };

/** The bulk sheet's Set #N apply: membership and numbers in one write, into a
 *  collection or a series created for it. */
function useAddNumberedBooks() {
	return useCollectionMutation(
		async (vars: { target: NumberedTarget; numbers: ReadonlyMap<string, number | null> }) => {
			const collectionId =
				"collectionId" in vars.target
					? vars.target.collectionId
					: (await queries.createSeriesCollection(vars.target.newSeries)).id;
			await queries.addBooksToCollection(
				collectionId,
				[...vars.numbers.keys()],
				undefined,
				vars.numbers,
			);
			return collectionId;
		},
	);
}

function useReorderCollection() {
	return useCollectionMutation((vars: { collectionId: string; order: MembershipOrder[] }) =>
		queries.setMembershipOrder(vars.collectionId, vars.order),
	);
}

function useRemoveBooksFromCollection() {
	return useCollectionMutation((vars: { collectionId: string; bookIds: string[] }) =>
		queries.removeBooksFromCollection(vars.collectionId, vars.bookIds),
	);
}

export const collectionHooks = {
	useCollections,
	useCollectionBookIds,
	useCollectionIdsForBook,
	useCollectionMemberships,
	useSeriesMemberships,
	useCollectionMembers,
	useAddNumberedBooks,
	useCreateCollection,
	useCreateCollectionWithBooks,
	useEditCollection,
	useRenameCollection,
	useSetCollectionView,
	useMoveCollection,
	useDeleteCollection,
	useAddBooksToCollection,
	useRemoveBooksFromCollection,
	useReorderCollection,
	useSeriesMembershipForBook,
	useSaveBookSeries,
	useImportSeriesState,
};
