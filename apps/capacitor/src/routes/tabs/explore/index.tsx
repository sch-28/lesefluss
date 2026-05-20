import { createFileRoute } from "@tanstack/react-router";
import Explore from "@/pages/explore";

export const Route = createFileRoute("/tabs/explore/")({
	component: Explore,
	validateSearch: (search: Record<string, unknown>): { genre?: string } => ({
		genre: typeof search.genre === "string" ? search.genre : undefined,
	}),
});
