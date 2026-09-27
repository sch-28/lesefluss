import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { listRelationships } from "~/lib/social/friends";

export const Route = createFileRoute("/api/social/relationships")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			GET: async ({ context }) => Response.json(await listRelationships(context.user.id)),
		},
	},
});
