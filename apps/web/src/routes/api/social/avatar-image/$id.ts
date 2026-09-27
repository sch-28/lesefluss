import { createFileRoute } from "@tanstack/react-router";
import { getAvatarData } from "~/lib/social/avatar";
import { isUuid } from "~/lib/uuid";

// Deliberately unauthenticated and outside the other social routes' tree: an
// <img> cannot send a bearer token, so the random id is the access control.
// Every replacement mints a new id, which is what makes `immutable` safe;
// `private` keeps a removed picture out of shared caches.
export const Route = createFileRoute("/api/social/avatar-image/$id")({
	server: {
		handlers: {
			GET: async ({ params }) => {
				if (!isUuid(params.id)) return new Response(null, { status: 404 });
				const data = await getAvatarData(params.id);
				if (!data) return new Response(null, { status: 404 });
				return new Response(new Uint8Array(data), {
					headers: {
						"Content-Type": "image/webp",
						"Cache-Control": "private, max-age=31536000, immutable",
						"Content-Length": String(data.byteLength),
					},
				});
			},
		},
	},
});
