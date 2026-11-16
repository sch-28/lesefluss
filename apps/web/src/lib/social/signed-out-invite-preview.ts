import {
	type InvitePreview,
	InviteTokenBodySchema,
	type SignedOutInvitePreview,
} from "@lesefluss/core";
import { getClientKey } from "~/lib/rate-limit";
import { invalidPayloadResponse, parseJsonBody, rateLimited } from "./http";

/**
 * Never reads the session, so a caller learns no more than the public
 * /invite/$token page shows: who owns a live link, never their books or friends.
 */
export function signedOutInvitePreview(preview: (token: string) => Promise<InvitePreview>) {
	return async ({ request }: { request: Request }): Promise<Response> => {
		const limited = rateLimited(`invite-preview-signed-out:${getClientKey(request)}`, {
			max: 120,
			windowMs: 60_000,
		});
		if (limited) return limited;
		const parsed = InviteTokenBodySchema.safeParse(await parseJsonBody(request));
		if (!parsed.success) return invalidPayloadResponse();
		return Response.json(toSignedOut(await preview(parsed.data.token)));
	};
}

/** A visitor without a session gets the signed-out fields only, wherever the preview is served. */
export function previewForViewer(
	viewerId: string | null,
	preview: InvitePreview,
): InvitePreview | SignedOutInvitePreview {
	return viewerId === null ? toSignedOut(preview) : preview;
}

function toSignedOut({ state, owner }: InvitePreview): SignedOutInvitePreview {
	if (!owner) return { state };
	return { state, owner: { handle: owner.handle, name: owner.name, avatarUrl: owner.avatarUrl } };
}
