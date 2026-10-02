import { createFileRoute } from "@tanstack/react-router";
import WebNovelPreview from "@/pages/explore/web-novel-preview";

export const Route = createFileRoute("/tabs/explore/web-novel-preview")({
	component: WebNovelPreviewRoute,
	validateSearch: (search: Record<string, unknown>): { url?: string } => ({
		url: typeof search.url === "string" ? search.url : undefined,
	}),
});

function WebNovelPreviewRoute() {
	return <WebNovelPreview search={Route.useSearch()} />;
}
