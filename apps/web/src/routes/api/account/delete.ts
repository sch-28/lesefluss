import { DeleteAccountRequestSchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { deleteUserAccount } from "~/lib/account-deletion";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { socialPost } from "~/lib/social/http";

// The app's counterpart of the /account page's deleteAccount server function.
export const Route = createFileRoute("/api/account/delete")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: socialPost({
				limit: { key: "account-delete", max: 3, windowMs: 60_000 },
				schema: DeleteAccountRequestSchema,
				run: (userId) => deleteUserAccount(userId),
			}),
		},
	},
});
