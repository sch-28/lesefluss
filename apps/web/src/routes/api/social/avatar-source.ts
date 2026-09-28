import { AvatarSourceBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { removeAvatar, setAvatarFromAccountPicture } from "~/lib/social/avatar";
import { AVATAR_RATE_LIMIT, socialPost } from "~/lib/social/http";
import { getOwnProfile } from "~/lib/social/profile";

export const Route = createFileRoute("/api/social/avatar-source")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: socialPost({
				limit: { key: "social-avatar", ...AVATAR_RATE_LIMIT },
				schema: AvatarSourceBodySchema,
				run: async (userId, body) => {
					if (body.source === "account") await setAvatarFromAccountPicture(userId);
					else await removeAvatar(userId);
					return getOwnProfile(userId);
				},
			}),
		},
	},
});
