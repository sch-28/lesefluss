import { UpdateSocialProfileBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { invalidPayloadResponse, parseJsonBody, rateLimited } from "~/lib/social/http";
import { getOwnProfile, updateOwnProfile } from "~/lib/social/profile";

export const Route = createFileRoute("/api/social/profile")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			GET: async ({ context }) => {
				const profile = await getOwnProfile(context.user.id);
				return Response.json(profile);
			},
			POST: async ({ request, context }) => {
				const userId = context.user.id;
				const limited = rateLimited(`social-profile:${userId}`, { max: 30, windowMs: 60_000 });
				if (limited) return limited;
				const parsed = UpdateSocialProfileBodySchema.safeParse(await parseJsonBody(request));
				if (!parsed.success) {
					return invalidPayloadResponse();
				}
				await updateOwnProfile(userId, parsed.data);
				return Response.json(await getOwnProfile(userId));
			},
		},
	},
});
