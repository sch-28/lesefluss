import { useNavigate, useRouter } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type React from "react";
import { useMediaQuery } from "../../hooks/use-media-query";
import { AllSeriesList } from "./all-series-list";
import { seriesSummary } from "./series-nav";
import { useOpenSeries, useSeriesEntries } from "./use-series-nav";

const AllSeriesPage: React.FC = () => {
	const navigate = useNavigate();
	const router = useRouter();
	const { entries, covers } = useSeriesEntries();
	const openSeries = useOpenSeries();
	const isDesktop = useMediaQuery("(min-width: 768px)");
	const goBack = () =>
		router.history.canGoBack()
			? router.history.back()
			: void navigate({ to: "/tabs/library", search: {}, replace: true });

	return (
		<div className="bg-background text-foreground" data-testid="all-series-page">
			<div className="border-border border-b px-4 pt-[calc(var(--safe-top)+0.75rem)] pb-3">
				<nav
					aria-label="Breadcrumb"
					className="flex items-center gap-1 text-muted-foreground text-xs"
				>
					<button
						type="button"
						onClick={() => navigate({ to: "/tabs/library", search: {} })}
						className="rounded-sm border-0 bg-transparent p-0 text-muted-foreground hover:text-foreground"
					>
						Library
					</button>
					<ChevronRight aria-hidden className="size-3" />
					<span aria-current="page" className="text-foreground">
						All series
					</span>
				</nav>
				<h2 className="m-0 mt-1 font-semibold text-lg">All series</h2>
				<p className="m-0 text-muted-foreground text-sm" data-testid="all-series-summary">
					{seriesSummary(entries)}
				</p>
			</div>
			<div className="p-4">
				{entries.length === 0 ? (
					<p className="m-0 p-6 text-center text-muted-foreground text-sm">
						Book series and serials you add show up here.
					</p>
				) : (
					<AllSeriesList
						entries={entries}
						covers={covers}
						onPick={openSeries}
						onExit={goBack}
						autoFocus={isDesktop}
					/>
				)}
			</div>
		</div>
	);
};

export default AllSeriesPage;
