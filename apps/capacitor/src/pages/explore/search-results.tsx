import { useQuery } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import type React from "react";
import {
	type CatalogSearchOrder,
	type CatalogSearchResult,
	searchCatalog,
} from "../../services/catalog/client";
import { catalogKeys } from "../../services/catalog/query-keys";
import Pagination from "./pagination";
import ResultCard from "./result-card";

type Props = {
	q: string;
	lang: string;
	genre: string | null;
	order: CatalogSearchOrder;
	page: number;
	onPageChange: (page: number) => void;
	onOpen: (result: CatalogSearchResult) => void;
};

const PAGE_SIZE = 20;

const ExploreSearchResults: React.FC<Props> = ({
	q,
	lang,
	genre,
	order,
	page,
	onPageChange,
	onOpen,
}) => {
	const enabled = q.length > 0 || genre !== null;

	const { data, isPending, isFetching, isError, error } = useQuery({
		queryKey: catalogKeys.search(q, lang, genre, order, page),
		queryFn: ({ signal }) =>
			searchCatalog({
				q,
				lang,
				genre: genre ?? undefined,
				order,
				page,
				limit: PAGE_SIZE,
				signal,
			}),
		enabled,
		placeholderData: (prev) => prev,
	});

	if (!enabled) {
		return (
			<div className="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
				<Search className="mb-4 size-12 text-muted-foreground/40" />
				<p className="m-0 text-muted-foreground">Search thousands of public-domain books.</p>
			</div>
		);
	}

	if (isError) {
		return (
			<div className="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
				<p className="m-0 text-muted-foreground">
					{error instanceof Error ? error.message : "Check your connection."}
				</p>
			</div>
		);
	}

	if (isPending || !data) {
		return (
			<div className="flex min-h-[60vh] items-center justify-center p-8">
				<Loader2 className="size-6 animate-spin text-muted-foreground" />
			</div>
		);
	}

	const totalPages = Math.max(1, Math.ceil(data.total / data.limit));
	const results = data.results;

	if (results.length === 0) {
		return (
			<div className="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
				<p className="m-0 text-muted-foreground">No results. Try a different search.</p>
			</div>
		);
	}

	return (
		<>
			<div>
				<div className="flex items-baseline justify-between px-4 pt-2 text-muted-foreground text-xs">
					<span>
						{data.total.toLocaleString()} result{data.total === 1 ? "" : "s"}
					</span>
					{isFetching && <Loader2 className="size-3.5 animate-spin" />}
				</div>
				<div className="grid grid-cols-3 gap-4 p-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
					{results.map((r) => (
						<ResultCard key={r.id} result={r} onOpen={() => onOpen(r)} />
					))}
				</div>
			</div>
			<Pagination
				page={page}
				totalPages={totalPages}
				onChange={onPageChange}
				disabled={isFetching}
			/>
		</>
	);
};

export default ExploreSearchResults;
