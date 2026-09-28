import type {
	AvatarSourceBody,
	ClaimHandleBody,
	HandleAvailability,
	HandleClaimFailure,
	InviteInfo,
	InvitePreview,
	OwnSocialProfile,
	RelationshipState,
	RespondToRequestBody,
	SocialRelationships,
	UpdateSocialProfileBody,
} from "@lesefluss/core";
import { handleClaimFailure, parseSocialErrorBody, SOCIAL_API } from "@lesefluss/core";

export class SocialRequestError extends Error {
	constructor(
		readonly status: number,
		readonly reason: string | undefined,
		readonly retryAfterDays: number | undefined,
	) {
		super(`Request failed (${status})`);
	}
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(path, { credentials: "same-origin", ...init });
	if (!res.ok) {
		const body = parseSocialErrorBody(await res.json().catch(() => null));
		throw new SocialRequestError(res.status, body.reason, body.retryAfterDays);
	}
	return res.json();
}

function postJson<T>(path: string, body: unknown): Promise<T> {
	return request<T>(path, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

/** The same `/api/social/*` routes the app uses, reached with the session cookie. */
export const socialClient = {
	getOwnProfile: () => request<OwnSocialProfile>(SOCIAL_API.profile),
	checkHandle: (handle: string) => postJson<HandleAvailability>(SOCIAL_API.handleCheck, { handle }),
	claimHandle: (body: ClaimHandleBody) => postJson<OwnSocialProfile>(SOCIAL_API.handle, body),
	updateProfile: (body: UpdateSocialProfileBody) =>
		postJson<OwnSocialProfile>(SOCIAL_API.profile, body),
	uploadAvatar: (file: File) =>
		request<OwnSocialProfile>(SOCIAL_API.avatar, {
			method: "POST",
			headers: { "Content-Type": file.type },
			body: file,
		}),
	setAvatarSource: (body: AvatarSourceBody) =>
		postJson<OwnSocialProfile>(SOCIAL_API.avatarSource, body),
};

export function claimFailure(err: unknown): HandleClaimFailure {
	if (err instanceof SocialRequestError) return handleClaimFailure(err.status, err.reason);
	return "offline";
}

export function errorReason(err: unknown): string | undefined {
	return err instanceof SocialRequestError ? err.reason : undefined;
}

export function retryAfterDays(err: unknown): number | undefined {
	return err instanceof SocialRequestError ? err.retryAfterDays : undefined;
}

export const friendsClient = {
	relationships: () => request<SocialRelationships>(SOCIAL_API.relationships),
	sendRequest: (userId: string) =>
		postJson<{ state: RelationshipState }>(SOCIAL_API.friendRequest, { userId }),
	respond: (body: RespondToRequestBody) =>
		postJson<{ state: RelationshipState }>(SOCIAL_API.friendRequestRespond, body),
	cancel: (requestId: string) =>
		postJson<{ state: RelationshipState }>(SOCIAL_API.friendRequestCancel, { requestId }),
	remove: (userId: string) =>
		postJson<{ state: RelationshipState }>(SOCIAL_API.friendRemove, { userId }),
	block: (userId: string) => postJson<{ ok: true }>(SOCIAL_API.block, { userId }),
	unblock: (userId: string) => postJson<{ ok: true }>(SOCIAL_API.unblock, { userId }),
	currentInvite: () => request<InviteInfo | null>(SOCIAL_API.invite),
	createInvite: () => postJson<InviteInfo>(SOCIAL_API.invite, {}),
	revokeInvite: () => postJson<{ ok: true }>(SOCIAL_API.inviteRevoke, {}),
	previewInvite: (token: string) => postJson<InvitePreview>(SOCIAL_API.invitePreview, { token }),
	redeemInvite: (token: string) => postJson<InvitePreview>(SOCIAL_API.inviteRedeem, { token }),
};
