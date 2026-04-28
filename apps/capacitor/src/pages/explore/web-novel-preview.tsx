import { useIonRouter } from "@ionic/react";
import { addOutline } from "ionicons/icons";
import type React from "react";
import { useState } from "react";
import { Redirect, useLocation } from "react-router-dom";
import { toast } from "../../components/toast";
import { queryHooks } from "../../services/db/hooks";
import {
	chapterCountLabel,
	providerLabel,
	type SearchResult,
} from "../../services/serial-scrapers";
import { DetailShell } from "../_shared/detail-shell";

/**
 * Preview page for a serial-search result that hasn't been imported yet.
 *
 * Reached from the routed search page (`/tabs/explore/web-novels`): tapping a
 * result pushes here and forwards the full `SearchResult` via
 * `history.push({ state })`. We don't try to re-fetch a single result by URL
 * because the upstream search endpoint isn't keyed that way — if state is
 * missing (deep link, refresh), we render a "Back to search" empty state.
 *
 * The "Add to library" primary action runs the same `useImportSerialFromUrl`
 * mutation the search page uses; on success we replace history to
 * `/tabs/library` (intentional teleport — the imported series is the user's
 * destination).
 */
const WebNovelPreview: React.FC = () => {
	// `useIonRouter` (not `useHistory`) is required for cross-tab navigation:
	// `history.replace("/tabs/library")` from within the Explore tab's outlet
	// only unmounts this page — Ionic restores the route under the same tab
	// and the no-state Redirect below fires, dumping the user on Explore.
	// `ionRouter.push("/tabs/library", "none")` swaps the active tab outlet so
	// the user actually lands on Library after import.
	const ionRouter = useIonRouter();
	const location = useLocation<{ result?: SearchResult }>();

	// Stash the search result in local state on first render. Without this, the
	// post-import navigation triggers a re-render *before* this component
	// unmounts; `useLocation()` resolves to the new pathname, `state.result`
	// reads as undefined, and the no-state Redirect below races to /tabs/explore
	// instead of letting the tab swap to Library complete. The Redirect still
	// does its real job — when the user later taps the Explore tab, the preview
	// re-mounts cold, this state initializes from an empty `location.state`,
	// and the user lands on the Explore root as intended.
	const [result] = useState<SearchResult | undefined>(() => location.state?.result);

	const importMutation = queryHooks.useImportSerialFromUrl();

	// No state means we got here without a result payload — a deep link, a
	// refresh, or a re-mount after the user navigated away. Send them to the
	// Explore landing rather than render an error page.
	if (!result) {
		return <Redirect to="/tabs/explore" />;
	}

	const isImporting = importMutation.isPending;
	const provider = providerLabel(result.provider);

	const handleImport = () => {
		toast.info(`Importing "${result.title}"…`);
		importMutation.mutate(
			{ url: result.sourceUrl },
			{
				onSuccess: () => ionRouter.push("/tabs/library", "none"),
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
				label: isImporting ? "Importing…" : "Add to library",
				icon: addOutline,
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
