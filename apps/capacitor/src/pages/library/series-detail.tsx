import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@lesefluss/ui/alert-dialog";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { BookOpen, CircleX, CloudDownload, Trash2 } from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import { CloudflareChallenge } from "../../components/cloudflare-challenge";
import { queryHooks } from "../../services/db/hooks";
import { serialKeys } from "../../services/db/hooks/query-keys";
import { queries } from "../../services/db/queries";
import { chapterCountLabel, providerLabel } from "../../services/serial-scrapers";
import { IS_WEB } from "../../utils/platform";
import { type DetailAction, DetailShell } from "../_shared/detail-shell";
import { SeriesChapterList } from "./series-chapter-list";
import { useChapterBatchDownload } from "./use-chapter-batch-download";

interface Props {
	id?: string;
}

const SeriesDetail: React.FC<Props> = ({ id: propId }) => {
	const id = propId ?? "";
	const router = useRouter();
	const [isDeleteOpen, setIsDeleteOpen] = useState(false);

	const { data: series, isPending: seriesPending } = useQuery({
		queryKey: serialKeys.detail(id),
		queryFn: () => queries.getSeries(id),
		enabled: !!id,
	});

	// Entry chapter (last-read or chapter 0). Drives the primary "Continue / Start"
	// action so the button label can name the actual chapter.
	const { data: entryChapter } = useQuery({
		queryKey: serialKeys.entry(id),
		queryFn: () => queries.getSeriesEntryChapter(id),
		enabled: !!id,
	});

	const { data: counts } = queryHooks.useSeriesChapterCounts();
	const chapterCount = counts?.get(id);

	const deleteMutation = queryHooks.useDeleteSeries();
	const {
		isSyncing,
		error: syncError,
		retry: retrySync,
	} = queryHooks.useChapterListSync(series?.id);

	const { data: chapters } = queryHooks.useSeriesChapters(series?.id);
	const pendingChapterIds = useMemo(
		() =>
			(chapters ?? []).filter((c) => c.chapterStatus === "pending" && !c.deleted).map((c) => c.id),
		[chapters],
	);
	const batch = useChapterBatchDownload(series?.id);

	// Hoisted so hook order stays stable across early returns (React error #310).
	const deleteHeaderAction = useMemo(
		() => ({
			label: "Delete series",
			icon: Trash2,
			destructive: true,
			onClick: () => setIsDeleteOpen(true),
		}),
		[],
	);

	if (seriesPending) {
		return (
			<DetailShell
				cover={null}
				title="Loading..."
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
					onClick: () => router.navigate({ to: "/tabs/library", replace: true }),
				}}
				errorMessage="Series not found."
			/>
		);
	}

	const hasStarted = entryChapter && (entryChapter.lastRead ?? 0) > 0;
	const primaryLabel = !entryChapter
		? "No chapters yet"
		: hasStarted
			? `Continue chapter ${(entryChapter.chapterIndex ?? 0) + 1}`
			: "Start reading";

	const statsLine = chapterCount !== undefined && <span>{chapterCountLabel(chapterCount)}</span>;

	const provider = providerLabel(series.provider);

	// Hidden on web: chapter fetches go through the catalog `/proxy/article`
	// endpoint there, so "Download all" on a long series would hammer our
	// backend. Native fetches go device-direct.
	const downloadAction: DetailAction | null = IS_WEB
		? null
		: batch.isRunning
			? {
					label: batch.progress
						? `Cancel download (${batch.progress.current} / ${batch.progress.total})`
						: "Cancel download",
					icon: CircleX,
					onClick: () => batch.cancel(),
				}
			: pendingChapterIds.length > 0
				? {
						label: `Download all chapters (${pendingChapterIds.length})`,
						icon: CloudDownload,
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
					icon: BookOpen,
					disabled: !entryChapter,
					onClick: () => {
						if (entryChapter)
							router.navigate({ to: "/tabs/reader/$id", params: { id: entryChapter.id } });
					},
				}}
				secondaryActions={downloadAction ? [downloadAction] : undefined}
				progress={downloadProgressPct}
				description={series.description ? { text: series.description } : undefined}
				externalLink={{ href: series.sourceUrl, label: `View on ${provider}` }}
				headerAction={deleteHeaderAction}
			>
				{syncError?.message === "CLOUDFLARE_CHALLENGE" && (
					<div className="px-4 pt-3">
						<CloudflareChallenge provider={series.provider} onResolved={retrySync} />
					</div>
				)}
				<SeriesChapterList seriesId={series.id} isSyncing={isSyncing} />
			</DetailShell>

			<AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete series?</AlertDialogTitle>
						<AlertDialogDescription>
							"{series.title}" and all its chapters will be removed from your library.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							onClick={() => {
								deleteMutation.mutate(
									{ id: series.id, title: series.title },
									{
										onSuccess: () => router.navigate({ to: "/tabs/library", replace: true }),
									},
								);
							}}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
};

export default SeriesDetail;
