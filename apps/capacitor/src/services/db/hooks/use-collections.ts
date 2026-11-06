import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { scheduleSyncPush } from "../../sync";
import { queries } from "../queries";
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

function useCollectionIdsForBook(bookId: string | null) {
	return useQuery({
		queryKey: collectionKeys.ofBook(bookId ?? ""),
		queryFn: () => queries.getCollectionIdsForBook(bookId ?? ""),
		enabled: bookId !== null,
	});
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
	});
}

function useCreateCollection() {
	return useCollectionMutation((name: string) => queries.createCollection(name));
}

function useRenameCollection() {
	return useCollectionMutation((vars: { id: string; name: string }) =>
		queries.renameCollection(vars.id, vars.name),
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

/** `addBooksToCollection` is also the write LESE-125.13's bulk sheet calls. */
function useAddBooksToCollection() {
	return useCollectionMutation((vars: { collectionId: string; bookIds: string[] }) =>
		queries.addBooksToCollection(vars.collectionId, vars.bookIds),
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
	useCreateCollection,
	useRenameCollection,
	useMoveCollection,
	useDeleteCollection,
	useAddBooksToCollection,
	useRemoveBooksFromCollection,
};
