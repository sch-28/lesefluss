import type React from "react";
import type { CatalogSearchResult } from "../../services/catalog/client";
import { queryHooks } from "../../services/db/hooks";
import { readingTimeLabel } from "./length";
import ResultCard from "./result-card";
import { useCatalogImport } from "./use-catalog-import";
import { useReaderWpm } from "./use-reader-wpm";

type Props = {
	result: CatalogSearchResult;
	onOpen: () => void;
};

/** ResultCard wired to library membership and quick add. */
const CatalogResultCard: React.FC<Props> = ({ result, onOpen }) => {
	const { data: libraryIds } = queryHooks.useLibraryCatalogIds();
	const importer = useCatalogImport(result.id);
	const wpm = useReaderWpm();

	const isInLibrary = libraryIds?.has(result.id) ?? false;
	// Wait for the lookup before offering add, or an owned book flashes a "+".
	const canQuickAdd = libraryIds !== undefined && !isInLibrary && result.hasEpub !== false;

	return (
		<ResultCard
			result={result}
			onOpen={onOpen}
			isInLibrary={isInLibrary}
			onQuickAdd={
				canQuickAdd ? () => importer.start({ title: result.title, intent: "add" }) : undefined
			}
			isAdding={importer.isImporting}
			readingTime={readingTimeLabel(result.wordCount, wpm)}
		/>
	);
};

export default CatalogResultCard;
