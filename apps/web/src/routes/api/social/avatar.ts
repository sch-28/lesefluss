import { AVATAR_MAX_BYTES, AVATAR_MIME_TYPES } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { readBodyCapped, setAvatar } from "~/lib/social/avatar";
import { SocialError } from "~/lib/social/errors";
import { AVATAR_RATE_LIMIT, socialAction } from "~/lib/social/http";
import { getOwnProfile } from "~/lib/social/profile";

const ACCEPTED: ReadonlySet<string> = new Set(AVATAR_MIME_TYPES);

/** POST the raw image bytes with their Content-Type; the server sniffs the real format. */
export const Route = createFileRoute("/api/social/avatar")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: socialAction({
				limit: { key: "social-avatar", ...AVATAR_RATE_LIMIT },
				run: async (userId, request) => {
					const type = request.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
					if (!ACCEPTED.has(type)) throw new SocialError("unsupported_image");
					await setAvatar(userId, await readBodyCapped(request.body, AVATAR_MAX_BYTES));
					return getOwnProfile(userId);
				},
			}),
		},
	},
});
