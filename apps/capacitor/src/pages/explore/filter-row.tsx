import { Button } from "@lesefluss/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@lesefluss/ui/dropdown-menu";
import { cn } from "@lesefluss/ui/utils";
import { ChevronDown, Plus, Tag, X } from "lucide-react";
import type React from "react";
import { useRef, useState } from "react";
import {
	CATALOG_SOURCE_LABELS,
	type CatalogGenre,
	type CatalogSort,
	type CatalogSource,
	type CatalogTagCount,
} from "../../services/catalog/client";
import { canAddTag, type ExploreSearch, effectiveSort, parseTags } from "./explore-search";
import { languageLabel } from "./language-label";
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

type FilterChipProps<T extends string> = {
	label: string;
	isActive: boolean;
	value: T;
	options: readonly { value: T; label: string; count?: number }[];
	onSelect: (value: T) => void;
	onClear?: () => void;
};

/**
 * On touch, opens on click instead of Radix's pointerdown: a swipe across the
 * scrolling chip row would otherwise open a menu and kill the scroll. Mouse
 * keeps Radix's own handling, so the two never toggle the same press twice.
 */
function FilterChip<T extends string>({
	label,
	isActive,
	value,
	options,
	onSelect,
	onClear,
}: FilterChipProps<T>) {
	const [isOpen, setOpen] = useState(false);
	const pointerTypeRef = useRef<string>("mouse");
	return (
		<div className="flex shrink-0 items-center">
			<DropdownMenu open={isOpen} onOpenChange={setOpen}>
				<DropdownMenuTrigger asChild>
					<Button
						variant={isActive ? "default" : "outline"}
						size="sm"
						className={cn("gap-1", isActive && onClear && "rounded-r-none pr-2")}
						onPointerDown={(e: React.PointerEvent<HTMLButtonElement>) => {
							pointerTypeRef.current = e.pointerType;
							if (e.pointerType !== "mouse") e.preventDefault();
						}}
						onClick={() => {
							if (pointerTypeRef.current !== "mouse") setOpen((open) => !open);
						}}
					>
						{label}
						<ChevronDown className="size-3.5" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="max-h-80 min-w-48 overflow-y-auto">
					<DropdownMenuRadioGroup
						value={value}
						onValueChange={(v) => {
							const option = options.find((o) => o.value === v);
							if (option) onSelect(option.value);
						}}
					>
						{options.map((o) => (
							<DropdownMenuRadioItem key={o.value} value={o.value} className="gap-4">
								<span className="flex-1 whitespace-nowrap">{o.label}</span>
								{o.count !== undefined && (
									<span className="whitespace-nowrap text-muted-foreground text-xs tabular-nums">
										{o.count.toLocaleString()}
									</span>
								)}
							</DropdownMenuRadioItem>
						))}
					</DropdownMenuRadioGroup>
				</DropdownMenuContent>
			</DropdownMenu>
			{isActive && onClear && (
				<Button
					variant="default"
					size="sm"
					className="rounded-l-none border-primary-foreground/20 border-l px-2"
					onClick={onClear}
					aria-label={`Remove ${label} filter`}
				>
					<X className="size-3.5" />
				</Button>
			)}
		</div>
	);
}

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
					onSelect={(v) => onChange({ length: v === ANY ? undefined : v })}
					onClear={() => onChange({ length: undefined })}
				/>
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
