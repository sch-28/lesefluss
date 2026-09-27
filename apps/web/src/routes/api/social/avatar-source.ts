import { AvatarSourceBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { removeAvatar, setAvatarFromAccountPicture } from "~/lib/social/avatar";
import {
	AVATAR_RATE_LIMIT,
	invalidPayloadResponse,
	parseJsonBody,
	rateLimited,
	socialErrorResponse,
} from "~/lib/social/http";
import { getOwnProfile } from "~/lib/social/profile";

export const Route = createFileRoute("/api/social/avatar-source")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: async ({ request, context }) => {
				const userId = context.user.id;
				const limited = rateLimited(`social-avatar:${userId}`, AVATAR_RATE_LIMIT);
				if (limited) return limited;
				const parsed = AvatarSourceBodySchema.safeParse(await parseJsonBody(request));
				if (!parsed.success) {
					return invalidPayloadResponse();
				}
				try {
					if (parsed.data.source === "account") await setAvatarFromAccountPicture(userId);
					else await removeAvatar(userId);
				} catch (err) {
					return socialErrorResponse(err);
				}
				return Response.json(await getOwnProfile(userId));
			},
		},
	},
});
