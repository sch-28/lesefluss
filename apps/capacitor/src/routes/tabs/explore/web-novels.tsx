import { createFileRoute } from "@tanstack/react-router";
import WebNovels from "@/pages/explore/web-novels";

export const Route = createFileRoute("/tabs/explore/web-novels")({
	component: WebNovels,
	validateSearch: (search: Record<string, unknown>): { provider?: string } => ({
		provider: typeof search.provider === "string" ? search.provider : undefined,
	}),
});
