import { useRouter, useSearch } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import type React from "react";
import { toast } from "../../components/toast";
import { queryHooks } from "../../services/db/hooks";
import { chapterCountLabel, providerLabel } from "../../services/serial-scrapers";
import { DetailShell } from "../_shared/detail-shell";
import { previewCache } from "./preview-cache";

/**
 * Preview page for a serial-search result that hasn't been imported yet.
 *
 * Reached from `/tabs/explore/web-novels`: tapping a result stashes the full
 * `SearchResult` in `previewCache` (keyed by sourceUrl) and navigates here
 * with `?url=...`. The preview reads the cached result back. Direct deep links
 * (no cache entry) render an error state with a "Back to web novels" button.
 */
const WebNovelPreview: React.FC = () => {
	const router = useRouter();
	const search = useSearch({ strict: false }) as { url?: string };
	const result = previewCache.get(search.url);
	const importMutation = queryHooks.useImportSerialFromUrl();

	if (!result) {
		return (
			<DetailShell
				cover={null}
				title="Preview unavailable"
				primaryAction={{
					label: "Back to web novels",
					onClick: () => router.navigate({ to: "/tabs/explore/web-novels" }),
				}}
				errorMessage="No preview data. Tap a result on the search page first."
			/>
		);
	}

	const isImporting = importMutation.isPending;
	const provider = providerLabel(result.provider);

	const handleImport = () => {
		toast.info(`Importing "${result.title}"...`);
		importMutation.mutate(
			{ url: result.sourceUrl },
			{
				onSuccess: () => router.navigate({ to: "/tabs/library" }),
				onError: (err) => {
					toast.error(err instanceof Error ? `Import failed: ${err.message}` : "Import failed");
				},
			},
		);
	};

	const statsLine = result.chapterCount != null && (
		<span>{chapterCountLabel(result.chapterCount)}</span>
	);

	return (
		<DetailShell
			cover={result.coverImage}
			eyebrow={provider}
			title={result.title}
			author={result.author}
			statsLine={statsLine}
			primaryAction={{
				label: isImporting ? "Importing..." : "Add to library",
				icon: Plus,
				disabled: isImporting,
				loading: isImporting,
				onClick: handleImport,
			}}
			description={result.description ? { text: result.description } : undefined}
			externalLink={{
				href: result.sourceUrl,
				label: `View on ${provider}`,
			}}
		/>
	);
};

export default WebNovelPreview;
