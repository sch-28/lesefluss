import { IonIcon, IonSpinner, IonText } from "@ionic/react";
import { useQuery } from "@tanstack/react-query";
import { searchOutline } from "ionicons/icons";
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
			<div className="flex h-full flex-col items-center justify-center p-8 text-center">
				<IonIcon icon={searchOutline} className="mb-4 text-6xl text-[#ccc]" />
				<IonText color="medium">
					<p style={{ margin: 0 }}>Search thousands of public-domain books.</p>
				</IonText>
			</div>
		);
	}

	if (isError) {
		return (
			<div className="flex h-full flex-col items-center justify-center p-8 text-center">
				<IonText color="medium">
					<p style={{ margin: 0 }}>
						{error instanceof Error ? error.message : "Check your connection."}
					</p>
				</IonText>
			</div>
		);
	}

	if (isPending || !data) {
		return (
			<div className="flex h-full items-center justify-center">
				<IonSpinner />
			</div>
		);
	}

	const totalPages = Math.max(1, Math.ceil(data.total / data.limit));
	const results = data.results;

	if (results.length === 0) {
		return (
			<div className="flex h-full flex-col items-center justify-center p-8 text-center">
				<IonText color="medium">
					<p style={{ margin: 0 }}>No results. Try a different search.</p>
				</IonText>
			</div>
		);
	}

	return (
		<>
			<div className="content-container">
				<div className="flex items-baseline justify-between px-4 pt-2 text-[#888] text-[0.75rem]">
					<span>
						{data.total.toLocaleString()} result{data.total === 1 ? "" : "s"}
					</span>
					{isFetching && <IonSpinner name="crescent" style={{ width: 14, height: 14 }} />}
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
