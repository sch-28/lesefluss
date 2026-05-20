import { createFileRoute } from "@tanstack/react-router";
import WebNovelPreview from "@/pages/explore/web-novel-preview";

export const Route = createFileRoute("/tabs/explore/web-novel-preview")({
	component: WebNovelPreview,
	validateSearch: (search: Record<string, unknown>): { url?: string } => ({
		url: typeof search.url === "string" ? search.url : undefined,
	}),
});
