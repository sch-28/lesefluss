import { IonAlert } from "@ionic/react";
import { useQuery } from "@tanstack/react-query";
import {
	bookOutline,
	closeCircleOutline,
	cloudDownloadOutline,
	trashOutline,
} from "ionicons/icons";
import type React from "react";
import { useMemo, useState } from "react";
import { useHistory, useParams } from "react-router-dom";
import { queryHooks } from "../../services/db/hooks";
import { serialKeys } from "../../services/db/hooks/query-keys";
import { queries } from "../../services/db/queries";
import { chapterCountLabel, providerLabel } from "../../services/serial-scrapers";
import { IS_WEB } from "../../utils/platform";
import { type DetailAction, DetailShell } from "../_shared/detail-shell";
import { SeriesChapterList } from "./series-chapter-list";
import { useChapterBatchDownload } from "./use-chapter-batch-download";

const SeriesDetail: React.FC = () => {
	const { id } = useParams<{ id: string }>();
	const history = useHistory();
	const [isDeleteOpen, setIsDeleteOpen] = useState(false);

	const { data: series, isPending: seriesPending } = useQuery({
		queryKey: serialKeys.detail(id),
		queryFn: () => queries.getSeries(id),
		enabled: !!id,
	});

	// Entry chapter (last-read or chapter 0). Used by the primary "Continue / Start"
	// action — looked up here so the button label can name the actual chapter.
	const { data: entryChapter } = useQuery({
		queryKey: serialKeys.entry(id),
		queryFn: () => queries.getSeriesEntryChapter(id),
		enabled: !!id,
	});

	const { data: counts } = queryHooks.useSeriesChapterCounts();
	const chapterCount = counts?.get(id);

	const deleteMutation = queryHooks.useDeleteSeries();
	const { isSyncing } = queryHooks.useChapterListSync(series?.id);

	const { data: chapters } = queryHooks.useSeriesChapters(series?.id);
	const pendingChapterIds = useMemo(
		() =>
			(chapters ?? []).filter((c) => c.chapterStatus === "pending" && !c.deleted).map((c) => c.id),
		[chapters],
	);
	const batch = useChapterBatchDownload(series?.id);

	// Hoisted above the conditional returns below — React's rules of hooks
	// require the hook order to be stable across renders. The first render
	// (series pending) used to early-return before this `useMemo` ran; the
	// second render (data loaded) then called it, tripping React error #310
	// "Rendered more hooks than during the previous render".
	const deleteHeaderAction = useMemo(
		() => ({
			label: "Delete series",
			icon: trashOutline,
			destructive: true,
			onClick: () => setIsDeleteOpen(true),
		}),
		[],
	);

	if (seriesPending) {
		return (
			<DetailShell
				cover={null}
				title="Loading…"
				primaryAction={{ label: "Loading", onClick: () => undefined, disabled: true }}
				isLoading
			/>
		);
	}

	if (!series) {
		return (
			<DetailShell
				cover={null}
				title="Series not found"
				primaryAction={{
					label: "Back to library",
					onClick: () => history.replace("/tabs/library"),
				}}
				errorMessage="Series not found."
			/>
		);
	}

	// Continue from last-read chapter; fall back to "Start reading" for a brand-new
	// series. If the series somehow has no chapters at all (shouldn't happen
	// post-import), the button is disabled with a clear label.
	const hasStarted = entryChapter && (entryChapter.lastRead ?? 0) > 0;
	const primaryLabel = !entryChapter
		? "No chapters yet"
		: hasStarted
			? `Continue chapter ${(entryChapter.chapterIndex ?? 0) + 1}`
			: "Start reading";

	const statsLine = chapterCount !== undefined && <span>{chapterCountLabel(chapterCount)}</span>;

	const provider = providerLabel(series.provider);

	// Hidden on web: chapter fetches there go through the catalog `/proxy/article`
	// endpoint (see `services/serial-scrapers/fetch.ts`), so a "Download all" on a
	// long series would hammer our backend. Native fetches go device-direct.
	const downloadAction: DetailAction | null = IS_WEB
		? null
		: batch.isRunning
			? {
					label: batch.progress
						? `Cancel download (${batch.progress.current} / ${batch.progress.total})`
						: "Cancel download",
					icon: closeCircleOutline,
					onClick: () => batch.cancel(),
				}
			: pendingChapterIds.length > 0
				? {
						label: `Download all chapters (${pendingChapterIds.length})`,
						icon: cloudDownloadOutline,
						onClick: () => void batch.start(pendingChapterIds),
					}
				: null;

	const downloadProgressPct = batch.progress
		? Math.round((batch.progress.current / batch.progress.total) * 100)
		: undefined;

	return (
		<>
			<DetailShell
				cover={series.coverImage}
				eyebrow={provider}
				title={series.title}
				author={series.author}
				statsLine={statsLine}
				primaryAction={{
					label: primaryLabel,
					icon: bookOutline,
					disabled: !entryChapter,
					onClick: () => {
						if (entryChapter) history.push(`/tabs/reader/${entryChapter.id}`);
					},
				}}
				secondaryActions={downloadAction ? [downloadAction] : undefined}
				progress={downloadProgressPct}
				description={series.description ? { text: series.description } : undefined}
				externalLink={{ href: series.sourceUrl, label: `View on ${provider}` }}
				headerAction={deleteHeaderAction}
			>
				<SeriesChapterList seriesId={series.id} isSyncing={isSyncing} />
			</DetailShell>

			<IonAlert
				isOpen={isDeleteOpen}
				onDidDismiss={() => setIsDeleteOpen(false)}
				header="Delete series?"
				message={`"${series.title}" and all its chapters will be removed from your library.`}
				buttons={[
					{ text: "Cancel", role: "cancel" },
					{
						text: "Delete",
						role: "destructive",
						handler: () => {
							deleteMutation.mutate(
								{ id: series.id, title: series.title },
								{ onSuccess: () => history.replace("/tabs/library") },
							);
						},
					},
				]}
				cssClass="rsvp-alert"
			/>
		</>
	);
};

export default SeriesDetail;
