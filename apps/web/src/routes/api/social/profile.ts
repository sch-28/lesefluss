import { UpdateSocialProfileBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { socialPost } from "~/lib/social/http";
import { getOwnProfile, updateOwnProfile } from "~/lib/social/profile";

export const Route = createFileRoute("/api/social/profile")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			GET: async ({ context }) => {
				const profile = await getOwnProfile(context.user.id);
				return Response.json(profile);
			},
			POST: socialPost({
				limit: { key: "social-profile", max: 30, windowMs: 60_000 },
				schema: UpdateSocialProfileBodySchema,
				run: async (userId, body) => {
					await updateOwnProfile(userId, body);
					return getOwnProfile(userId);
				},
			}),
		},
	},
});
