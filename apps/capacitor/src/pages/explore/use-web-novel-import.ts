import { useIsMutating } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { queryHooks } from "../../services/db/hooks";
import { serialImportMutationKey } from "../../services/db/hooks/query-keys";
import type { Series } from "../../services/db/schema";
import { normalizeSeriesUrl } from "../../services/serial-scrapers";
import { toastAdded, toastImportFailed } from "./import-toasts";
import { useLibrarySeriesByUrl } from "./use-library-membership";

/**
 * Library membership and import for one web-novel series. Feedback chains on
 * the `mutateAsync` promise rather than `mutate` callbacks, which React Query
 * drops once the caller unmounts. Cards and the preview for the same series
 * share `isImporting` through the scoped mutation key.
 */
export function useWebNovelImport(sourceUrl: string) {
	const router = useRouter();
	const normalizedUrl = normalizeSeriesUrl(sourceUrl);
	const seriesByUrl = useLibrarySeriesByUrl();
	const mutation = queryHooks.useImportSerialFromUrl(sourceUrl);
	const isImporting = useIsMutating({ mutationKey: serialImportMutationKey(normalizedUrl) }) > 0;
	const isMountedRef = useRef(true);
	useEffect(() => {
		isMountedRef.current = true;
		return () => {
			isMountedRef.current = false;
		};
	}, []);

	const existingSeriesId = seriesByUrl?.get(normalizedUrl);

	const start = (title: string, onDone?: (series: Series) => void) => {
		mutation
			.mutateAsync({ url: sourceUrl })
			.then((series) => {
				const openSeries = () =>
					router.navigate({ to: "/tabs/library/series/$id", params: { id: series.id } });
				if (onDone && isMountedRef.current) onDone(series);
				else toastAdded(title, openSeries);
			})
			.catch(() => toastImportFailed(title, () => start(title, onDone)));
	};

	return {
		existingSeriesId,
		isInLibrary: existingSeriesId !== undefined,
		/** False until the library lookup resolves, so an owned series never flashes "add". */
		isMembershipKnown: seriesByUrl !== undefined,
		isImporting,
		start,
	};
}
