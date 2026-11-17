import { Button } from "@lesefluss/ui/button";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { Layers, Plus } from "lucide-react";
import type React from "react";
import { PageHeader } from "../../components/app-shell/page-header";
import { EmptyState } from "../../components/empty-state";
import { PageContainer } from "../../components/page-container";
import { useMediaQuery } from "../../hooks/use-media-query";
import { AllSeriesList } from "./all-series-list";
import { seriesSummary } from "./series-nav";
import { useOpenSeries, useSeriesEntries } from "./use-series-nav";

const AllSeriesPage: React.FC = () => {
	const navigate = useNavigate();
	const router = useRouter();
	const { entries, covers, isPending } = useSeriesEntries();
	const openSeries = useOpenSeries();
	const isDesktop = useMediaQuery("(min-width: 768px)");
	const goBack = () =>
		router.history.canGoBack()
			? router.history.back()
			: void navigate({ to: "/tabs/library", search: {}, replace: true });

	const newSeries = () =>
		void navigate({ to: "/tabs/library/collections/new", search: { series: true } });

	return (
		<div className="bg-background text-foreground" data-testid="all-series-page">
			<PageHeader
				title="All series"
				width="grid"
				backTo="/tabs/library"
				right={
					<Button size="sm" onClick={newSeries}>
						<Plus />
						New series
					</Button>
				}
			/>
			<PageContainer width="grid" className="p-4">
				<p
					className="m-0 mb-3 min-h-[1lh] text-muted-foreground text-sm"
					data-testid="all-series-summary"
				>
					{isPending || entries.length === 0 ? null : seriesSummary(entries)}
				</p>
				{!isPending && entries.length === 0 ? (
					<EmptyState
						icon={Layers}
						title="No series yet"
						page
						action={
							<Button variant="outline" onClick={newSeries}>
								<Plus className="size-4" />
								New series
							</Button>
						}
					>
						Book series and serials you add show up here. Series are also found from book metadata
						on import.
					</EmptyState>
				) : (
					<AllSeriesList
						entries={entries}
						covers={covers}
						isPending={isPending}
						onPick={openSeries}
						onExit={goBack}
						autoFocus={isDesktop}
					/>
				)}
			</PageContainer>
		</div>
	);
};

export default AllSeriesPage;
