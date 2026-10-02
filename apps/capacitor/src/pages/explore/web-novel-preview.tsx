import { useRouter } from "@tanstack/react-router";
import { Library, Plus, Share2 } from "lucide-react";
import type React from "react";
import { toast } from "../../components/toast";
import { isSerialUrl, providerLabel } from "../../services/serial-scrapers";
import { DetailShell } from "../_shared/detail-shell";
import LengthFact from "./length-fact";
import { shareLink } from "./share-link";
import { useReadingSpeed } from "./use-reading-speed";
import { useSerialPreview } from "./use-serial-preview";
import { useWebNovelImport } from "./use-web-novel-import";
import { Ao3Meta, chapterFallback, webNovelFacts, webNovelLength } from "./web-novel-facts";

/**
 * Preview page for a web-novel series, at `?url=<series url>`. Reached from a
 * search result (metadata handed over in `previewCache`) or from a cold link,
 * in which case the metadata is fetched from the provider.
 */
type Props = { search: { url?: string } };

const WebNovelPreview: React.FC<Props> = ({ search }) => {
	const router = useRouter();
	// Anything else would turn this page into an app-branded link to any site.
	const url = search.url && isSerialUrl(search.url) ? search.url : undefined;
	const preview = useSerialPreview(url);
	const importer = useWebNovelImport(url ?? "");
	const speed = useReadingSpeed();

	const result = preview.result;
	const existingSeriesId = importer.existingSeriesId;

	if (!url) {
		return (
			<DetailShell
				cover={null}
				title="Preview unavailable"
				primaryAction={{
					label: "Back to web novels",
					onClick: () => router.navigate({ to: "/tabs/explore/web-novels" }),
				}}
				errorMessage="This link doesn't point to a web novel."
			/>
		);
	}

	if (!result) {
		return (
			<DetailShell
				cover={null}
				title={preview.isError ? "Couldn't load preview" : "Loading..."}
				primaryAction={{ label: "Loading", onClick: () => undefined, disabled: true }}
				isLoading={preview.isPending}
				error={preview.isError ? preview.error : undefined}
				onRetry={() => preview.refetch()}
				errorSourceLink={{ href: url, label: "Open the original page" }}
				externalLink={{ href: url }}
			/>
		);
	}

	const isImporting = importer.isImporting;
	const provider = providerLabel(result.provider);

	const handleImport = () => {
		toast.info(`Importing "${result.title}"...`);
		importer.start(result.title, () => router.navigate({ to: "/tabs/library" }));
	};

	const primaryAction = existingSeriesId
		? {
				label: "Open in Library",
				icon: Library,
				onClick: () =>
					router.navigate({
						to: "/tabs/library/series/$id",
						params: { id: existingSeriesId },
					}),
			}
		: {
				label: isImporting ? "Importing..." : "Add to library",
				icon: Plus,
				disabled: isImporting || !importer.isMembershipKnown,
				loading: isImporting,
				onClick: handleImport,
			};

	const length = webNovelLength(result.details);
	const chapters = chapterFallback(result);
	const statsLine = chapters && <span>{chapters}</span>;

	return (
		<DetailShell
			cover={result.coverImage}
			eyebrow={provider}
			title={result.title}
			author={result.author}
			statsLine={statsLine}
			facts={[
				length.wordCount ? (
					<LengthFact
						key="length"
						length={length}
						speed={speed}
						estimateNote={`Worked out from ${provider}'s page count.`}
					/>
				) : null,
				...webNovelFacts(result.details),
			].filter(Boolean)}
			subjects={result.details?.tags}
			primaryAction={primaryAction}
			description={result.description ? { text: result.description } : undefined}
			externalLink={{
				href: result.sourceUrl,
				label: `View on ${provider}`,
			}}
			headerActions={[
				{
					label: "Share",
					icon: Share2,
					onClick: () => void shareLink(result.title, result.sourceUrl, "Share web novel"),
				},
			]}
		>
			{result.details?.ao3 && <Ao3Meta meta={result.details.ao3} />}
		</DetailShell>
	);
};

export default WebNovelPreview;
