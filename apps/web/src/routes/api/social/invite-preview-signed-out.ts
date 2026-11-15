import { createFileRoute } from "@tanstack/react-router";
import { db } from "~/db";
import { cors } from "~/lib/cors-middleware";
import { previewInvite } from "~/lib/social/invite";
import { signedOutInvitePreview } from "~/lib/social/signed-out-invite-preview";

export const Route = createFileRoute("/api/social/invite-preview-signed-out")({
	server: {
		middleware: [cors],
		handlers: {
			POST: signedOutInvitePreview((token) => previewInvite(db, null, token)),
		},
	},
});
