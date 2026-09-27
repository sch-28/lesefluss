import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { db } from "~/db";
import { syncBooks, syncSeries } from "~/db/schema";
import { getClientKey } from "~/lib/rate-limit";
import { verifyCoverToken } from "~/lib/social/cover-token";
import { rateLimited } from "~/lib/social/http";
import { mayViewCover } from "~/lib/social/profile-view";

const DATA_URL = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/is;

// No session: an <img> cannot send a bearer token. The signed token names the
// viewer, and the friendship is checked again here so a block takes effect at
// once rather than when the token expires.
export const Route = createFileRoute("/api/social/cover-image/$token")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				// Per client, not per viewer: an invalid token names nobody.
				const limited = rateLimited(`social-cover:${getClientKey(request)}`, {
					max: 600,
					windowMs: 60_000,
				});
				if (limited) return limited;
				const ref = verifyCoverToken(params.token);
				if (!ref || !(await mayViewCover(ref.viewerId, ref))) {
					return new Response(null, { status: 404 });
				}
				const [row] =
					ref.kind === "book"
						? await db
								.select({
									cover: syncBooks.coverImage,
									deleted: syncBooks.deleted,
									hidden: syncBooks.hideFromProfile,
								})
								.from(syncBooks)
								.where(and(eq(syncBooks.userId, ref.ownerId), eq(syncBooks.bookId, ref.id)))
						: await db
								.select({
									cover: syncSeries.coverImage,
									deleted: syncSeries.deleted,
									hidden: eq(syncSeries.deleted, true),
								})
								.from(syncSeries)
								.where(and(eq(syncSeries.userId, ref.ownerId), eq(syncSeries.seriesId, ref.id)));
				if (!row?.cover || row.deleted || row.hidden) return new Response(null, { status: 404 });
				const match = DATA_URL.exec(row.cover);
				if (!match?.[1] || !match[2]) return new Response(null, { status: 404 });
				const bytes = Buffer.from(match[2], "base64");
				return new Response(new Uint8Array(bytes), {
					headers: {
						"Content-Type": match[1],
						"Content-Length": String(bytes.byteLength),
						"Cache-Control": "private, max-age=3600",
					},
				});
			},
		},
	},
});
