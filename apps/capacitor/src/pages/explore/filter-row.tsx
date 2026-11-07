import { Button } from "@lesefluss/ui/button";
import { Moon, Plus, Tag, X } from "lucide-react";
import type React from "react";
import { FilterChip } from "../../components/filter-chip";
import {
	CATALOG_SOURCE_LABELS,
	type CatalogGenre,
	type CatalogSort,
	type CatalogSource,
	type CatalogTagCount,
} from "../../services/catalog/client";
import { languageLabel } from "../../utils/language-label";
import { canAddTag, type ExploreSearch, effectiveSort, parseTags } from "./explore-search";
import { LENGTH_BUCKETS, type LengthBucket, lengthLabel } from "./length";

const SORT_LABELS: Record<CatalogSort, string> = {
	relevance: "Relevance",
	popular: "Popular",
	title: "Title A-Z",
	author: "Author",
	recent: "Recently added",
	length: "Shortest first",
};
const SORTS: readonly CatalogSort[] = [
	"relevance",
	"popular",
	"title",
	"author",
	"recent",
	"length",
];
const SOURCES: readonly CatalogSource[] = ["standard_ebooks", "gutenberg"];

const ANY = "any";
type Any = typeof ANY;

type Props = {
	search: ExploreSearch;
	lang: string;
	genres: readonly CatalogGenre[] | undefined;
	languages: readonly { code: string; count: number }[] | undefined;
	tagLabels: ReadonlyMap<string, string>;
	facets: readonly CatalogTagCount[] | undefined;
	onChange: (patch: Partial<ExploreSearch>) => void;
	onAddTag: (tagId: string) => void;
	onRemoveTag: (tagId: string) => void;
	onBrowseTags: () => void;
};

const FilterRow: React.FC<Props> = ({
	search,
	lang,
	genres,
	languages,
	tagLabels,
	facets,
	onChange,
	onAddTag,
	onRemoveTag,
	onBrowseTags,
}) => {
	const sort = effectiveSort(search);
	const activeTags = parseTags(search.tags);
	const genreLabel = genres?.find((g) => g.id === search.genre)?.label ?? search.genre;
	const visibleFacets = canAddTag(search) ? facets : undefined;

	const sortOptions = SORTS.filter((s) => s !== "relevance" || search.q).map((value) => ({
		value,
		label: SORT_LABELS[value],
	}));
	const genreOptions: { value: string; label: string; count?: number }[] = [
		{ value: ANY, label: "Any genre" },
		...(genres ?? []).map((g) => ({ value: g.id, label: g.label, count: g.count })),
	];
	const languageOptions = [
		{ value: "all", label: "All languages" },
		...(languages ?? []).map((l) => ({
			value: l.code,
			label: languageLabel(l.code),
			count: l.count,
		})),
	];
	const sourceOptions: { value: CatalogSource | Any; label: string }[] = [
		{ value: ANY, label: "Any source" },
		...SOURCES.map((value) => ({ value, label: CATALOG_SOURCE_LABELS[value] })),
	];
	const lengthOptions: { value: LengthBucket | Any; label: string }[] = [
		{ value: ANY, label: "Any length" },
		...LENGTH_BUCKETS.map((value) => ({ value, label: lengthLabel(value) })),
	];

	return (
		<div className="flex flex-col gap-2 px-4 pt-2">
			<div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" data-testid="filter-row">
				<FilterChip
					label={SORT_LABELS[sort]}
					isActive={search.sort !== undefined}
					value={sort}
					options={sortOptions}
					onSelect={(value) => onChange({ sort: value })}
				/>
				<FilterChip
					label={genreLabel ?? "Genre"}
					isActive={!!search.genre}
					value={search.genre ?? ANY}
					options={genreOptions}
					onSelect={(v) => onChange({ genre: v === ANY ? undefined : v })}
					onClear={() => onChange({ genre: undefined })}
				/>
				<FilterChip
					label={search.length ? lengthLabel(search.length) : "Length"}
					isActive={!!search.length}
					value={search.length ?? ANY}
					options={lengthOptions}
					onSelect={(v) => onChange({ length: v === ANY ? undefined : v, fits: undefined })}
					onClear={() => onChange({ length: undefined })}
				/>
				<Button
					variant={search.fits ? "default" : "outline"}
					size="sm"
					className="shrink-0 gap-1"
					aria-pressed={!!search.fits}
					onClick={() =>
						onChange(search.fits ? { fits: undefined } : { fits: "tonight", length: undefined })
					}
				>
					<Moon className="size-3.5" />
					Fits tonight
				</Button>
				<FilterChip
					label={languageLabel(lang)}
					isActive={false}
					value={lang}
					options={languageOptions}
					onSelect={(value) => onChange({ lang: value })}
				/>
				<FilterChip
					label={search.source ? CATALOG_SOURCE_LABELS[search.source] : "Source"}
					isActive={!!search.source}
					value={search.source ?? ANY}
					options={sourceOptions}
					onSelect={(v) => onChange({ source: v === ANY ? undefined : v })}
					onClear={() => onChange({ source: undefined })}
				/>
				{search.author && (
					<Button
						variant="default"
						size="sm"
						className="shrink-0 gap-1"
						onClick={() => onChange({ author: undefined })}
						aria-label={`Remove author filter ${search.author}`}
					>
						By {search.author}
						<X className="size-3.5" />
					</Button>
				)}
				<Button variant="outline" size="sm" className="shrink-0 gap-1" onClick={onBrowseTags}>
					<Tag className="size-3.5" />
					Tags
				</Button>
			</div>
			{(activeTags.length > 0 || (visibleFacets && visibleFacets.length > 0)) && (
				<div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" data-testid="tag-row">
					{activeTags.map((id) => (
						<Button
							key={id}
							variant="secondary"
							size="sm"
							className="shrink-0 gap-1"
							onClick={() => onRemoveTag(id)}
							aria-label={`Remove tag ${tagLabels.get(id) ?? id}`}
						>
							{tagLabels.get(id) ?? id}
							<X className="size-3.5" />
						</Button>
					))}
					{visibleFacets?.map((f) => (
						<Button
							key={f.id}
							variant="ghost"
							size="sm"
							className="shrink-0 gap-1 border border-border border-dashed"
							onClick={() => onAddTag(f.id)}
							aria-label={`Add tag ${f.label}`}
						>
							<Plus className="size-3.5" />
							{f.label}
							<span className="text-muted-foreground">{f.count}</span>
						</Button>
					))}
				</div>
			)}
		</div>
	);
};

export default FilterRow;
