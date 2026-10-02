import { Input } from "@lesefluss/ui/input";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { Tag } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { PageHeader } from "../../components/app-shell/page-header";
import { getTags } from "../../services/catalog/client";
import { catalogKeys } from "../../services/catalog/query-keys";
import { useDebounced } from "../../utils/use-debounced";
import { EmptyState, ErrorState } from "../_shared/load-states";
import { addTag, type ExploreSearch, withSearch } from "./explore-search";
import { rememberTagLabels } from "./tag-labels";
import { useExploreLang } from "./use-explore-lang";

const TAG_LIMIT = 200;
const DEBOUNCE_MS = 250;
const SKELETON_ROWS = ["a", "b", "c", "d", "e", "f"];

function useCatalogTags(lang: string | undefined, q: string) {
	return useQuery({
		queryKey: catalogKeys.tags(lang ?? "en", q),
		queryFn: async ({ signal }) => {
			const res = await getTags({ lang: lang ?? "en", q, limit: TAG_LIMIT }, signal);
			rememberTagLabels(res.tags);
			return res;
		},
		enabled: lang !== undefined,
		placeholderData: (prev) => prev,
	});
}

type Props = {
	/** The Explore search this page was opened from; a picked tag is added to it. */
	from: ExploreSearch;
};

const ExploreTags: React.FC<Props> = ({ from }) => {
	const router = useRouter();
	const lang = useExploreLang(from.lang);
	const [filter, setFilter] = useState("");
	const q = useDebounced(filter.trim().toLowerCase(), DEBOUNCE_MS);
	const tags = useCatalogTags(lang, q);

	const openTag = (id: string) =>
		router.navigate({
			to: "/tabs/explore",
			search: withSearch(addTag(from, id), { scope: undefined }),
		});

	return (
		<div className="bg-background">
			<PageHeader title="Browse by tag" icon={Tag} />
			<div className="mx-auto max-w-3xl px-4 pt-4 pb-20">
				<Input
					type="search"
					aria-label="Filter tags"
					placeholder="Filter tags, e.g. ghost stories"
					value={filter}
					onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFilter(e.target.value)}
				/>
				{tags.isPending ? (
					<div
						className="mt-4 flex flex-col gap-2"
						role="status"
						aria-busy="true"
						aria-label="Loading"
					>
						{SKELETON_ROWS.map((k) => (
							<div key={k} className="h-11 animate-pulse rounded-md bg-muted" />
						))}
					</div>
				) : tags.isError ? (
					<ErrorState error={tags.error} onRetry={() => tags.refetch()} />
				) : tags.data.tags.length === 0 ? (
					<EmptyState>No tags match "{filter}".</EmptyState>
				) : (
					<ul className="m-0 mt-4 flex list-none flex-col divide-y divide-border p-0">
						{tags.data.tags.map((t) => (
							<li key={t.id}>
								<button
									type="button"
									onClick={() => openTag(t.id)}
									className="flex w-full items-center justify-between gap-3 border-0 bg-transparent px-1 py-3 text-left text-foreground active:opacity-70"
								>
									<span className="truncate">{t.label}</span>
									<span className="shrink-0 text-muted-foreground text-sm">
										{t.count.toLocaleString()}
									</span>
								</button>
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
};

export default ExploreTags;
