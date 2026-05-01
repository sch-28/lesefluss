import { createFileRoute } from "@tanstack/react-router";
import { handleArticleImportRequest, handleArticleLookupRequest } from "~/lib/article-import";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";

export const Route = createFileRoute("/api/import/article")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			GET: async ({ request, context }) => {
				return handleArticleLookupRequest(request, context.user.id);
			},
			POST: async ({ request, context }) => {
				return handleArticleImportRequest(request, context.user.id);
			},
		},
	},
});
