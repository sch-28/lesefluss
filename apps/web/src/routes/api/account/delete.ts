import { DELETE_ACCOUNT_REFUSAL_MESSAGES, DeleteAccountRequestSchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { deleteUserAccount } from "~/lib/account-deletion";
import {
	ACCOUNT_DELETE_LIMIT,
	accountDeleteLimitKey,
	accountDeletionRefusal,
} from "~/lib/account-reauth";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { invalidPayloadResponse, parseJsonBody, rateLimited } from "~/lib/social/http";

// The app's counterpart of the /account page's deleteAccount server function.
export const Route = createFileRoute("/api/account/delete")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: async ({ request, context }) => {
				const userId = context.user.id;
				const limited = rateLimited(accountDeleteLimitKey(userId), ACCOUNT_DELETE_LIMIT);
				if (limited) return limited;
				const parsed = DeleteAccountRequestSchema.safeParse(await parseJsonBody(request));
				if (!parsed.success) return invalidPayloadResponse();
				const refusal = await accountDeletionRefusal(userId, parsed.data.password);
				// 403, not 401: the app reads a 401 as a lost session and signs out.
				if (refusal) {
					return Response.json(
						{ error: DELETE_ACCOUNT_REFUSAL_MESSAGES[refusal], reason: refusal },
						{ status: 403 },
					);
				}
				await deleteUserAccount(userId);
				return Response.json({ ok: true });
			},
		},
	},
});
