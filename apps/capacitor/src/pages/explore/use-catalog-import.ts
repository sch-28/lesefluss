import { useIsMutating, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { importFromCatalog } from "../../services/catalog/import";
import { catalogImportMutationKey, catalogKeys } from "../../services/catalog/query-keys";
import { bookKeys } from "../../services/db/hooks/query-keys";
import { scheduleSyncPush } from "../../services/sync";
import { toastAdded, toastImportFailed } from "./import-toasts";

export type ImportIntent = "read" | "add";
type ImportVars = { title: string; intent: ImportIntent };

/**
 * Import one catalog book. Feedback lives on the mutation, not on `mutate`
 * calls, so it still fires when the user leaves mid-download. Every entry
 * point for the same id shares `isImporting` through the mutation key.
 */
export function useCatalogImport(catalogId: string, opts: { withProgress?: boolean } = {}) {
	const qc = useQueryClient();
	const router = useRouter();
	const [progress, setProgress] = useState(0);
	const isMountedRef = useRef(true);
	useEffect(() => {
		isMountedRef.current = true;
		return () => {
			isMountedRef.current = false;
		};
	}, []);

	const mutationKey = catalogImportMutationKey(catalogId);
	const isImporting = useIsMutating({ mutationKey }) > 0;

	const mutation = useMutation({
		mutationKey,
		mutationFn: (_vars: ImportVars) =>
			importFromCatalog(catalogId, opts.withProgress ? setProgress : undefined),
		onSuccess: ({ book, existed }, { title, intent }) => {
			qc.invalidateQueries({ queryKey: bookKeys.all });
			qc.invalidateQueries({ queryKey: bookKeys.covers });
			qc.invalidateQueries({ queryKey: catalogKeys.localByCatalogId(catalogId) });
			// The catalog counts words from the download it just proxied.
			qc.invalidateQueries({ queryKey: catalogKeys.book(catalogId) });
			if (!existed) scheduleSyncPush();
			const openReader = () => router.navigate({ to: "/tabs/reader/$id", params: { id: book.id } });
			// Someone who backed out while it downloaded gets a toast, not a page jump.
			if (intent === "read" && isMountedRef.current) openReader();
			else toastAdded(title, openReader);
		},
		onError: (_err, vars) => toastImportFailed(vars.title, () => mutation.mutate(vars)),
		onSettled: () => setProgress(0),
	});

	return {
		start: (vars: ImportVars) => mutation.mutate(vars),
		isImporting,
		/** Undefined when the running import was started from another entry point. */
		intent: mutation.isPending ? mutation.variables?.intent : undefined,
		progress,
	};
}
