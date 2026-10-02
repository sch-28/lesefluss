import type React from "react";
import CoverImage from "../../components/cover-image";
import { type CatalogSearchResult, getCoverUrl } from "../../services/catalog/client";
import { queryHooks } from "../../services/db/hooks";
import { InLibraryBadge, QuickAddButton } from "./card-badges";
import { languageLabel } from "./language-label";
import { readingTimeLabel } from "./length";
import { useCatalogImport } from "./use-catalog-import";
import { useReaderWpm } from "./use-reader-wpm";

const MAX_SUBJECTS = 3;

type Props = {
	result: CatalogSearchResult;
	onOpen: () => void;
};

/** List-view row: scans better than a cover grid for classics with generic covers. */
const CatalogListItem: React.FC<Props> = ({ result, onOpen }) => {
	const { data: libraryIds } = queryHooks.useLibraryCatalogIds();
	const importer = useCatalogImport(result.id);
	const wpm = useReaderWpm();
	const isInLibrary = libraryIds?.has(result.id) ?? false;
	const canQuickAdd = libraryIds !== undefined && !isInLibrary && result.hasEpub !== false;
	const subjects = (result.subjects ?? []).slice(0, MAX_SUBJECTS);

	return (
		<div className="flex items-center gap-2" data-testid="catalog-list-item">
			<button
				type="button"
				onClick={onOpen}
				className="flex min-w-0 flex-1 cursor-pointer select-none items-start gap-3 border-0 bg-transparent px-0 py-3 text-left text-foreground active:opacity-70"
			>
				<div className="h-16 w-11 shrink-0 overflow-hidden rounded-sm border border-border bg-muted">
					<CoverImage src={getCoverUrl(result.id, result.coverUrl)} alt="" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="overflow-hidden text-ellipsis font-semibold text-[0.9rem] leading-[1.2] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [display:-webkit-box]">
						{result.title}
					</div>
					<div className="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-[0.8rem] text-muted-foreground">
						{[
							result.author,
							result.language ? languageLabel(result.language) : null,
							readingTimeLabel(result.wordCount, wpm),
						]
							.filter(Boolean)
							.join(" · ")}
					</div>
					{(subjects.length > 0 || isInLibrary) && (
						<div className="mt-1 flex flex-wrap items-center gap-1">
							{isInLibrary && <InLibraryBadge />}
							{subjects.map((s) => (
								<span
									key={s}
									className="max-w-full truncate rounded-full border border-border bg-muted px-2 py-0.5 text-[0.7rem] text-muted-foreground"
								>
									{s}
								</span>
							))}
						</div>
					)}
				</div>
			</button>
			{canQuickAdd && (
				<QuickAddButton
					title={result.title}
					isAdding={importer.isImporting}
					onAdd={() => importer.start({ title: result.title, intent: "add" })}
					className="shrink-0"
				/>
			)}
		</div>
	);
};

export default CatalogListItem;
