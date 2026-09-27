import type {
	InviteInfo,
	InvitePreview,
	RelationshipState,
	RespondToRequestBody,
	SocialRelationships,
} from "@lesefluss/core";
import { SOCIAL_API, socialActionErrorMessage } from "@lesefluss/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AuthedFetchError, authedFetch } from "../authed-fetch";
import { socialKeys } from "../db/hooks/query-keys";
import { socialQueryDefaults } from "./cache";
import { socialErrorBody } from "./profile";

async function getJson<T>(path: string): Promise<T> {
	const res = await authedFetch(path);
	return res.json();
}

async function postJson<T>(path: string, body: unknown = {}): Promise<T> {
	const res = await authedFetch(path, { method: "POST", body: JSON.stringify(body) });
	return res.json();
}

export const friendsClient = {
	relationships: () => getJson<SocialRelationships>(SOCIAL_API.relationships),
	respond: (body: RespondToRequestBody) =>
		postJson<{ state: RelationshipState }>(SOCIAL_API.friendRequestRespond, body),
	cancel: (requestId: string) =>
		postJson<{ state: RelationshipState }>(SOCIAL_API.friendRequestCancel, { requestId }),
	remove: (userId: string) =>
		postJson<{ state: RelationshipState }>(SOCIAL_API.friendRemove, { userId }),
	block: (userId: string) => postJson<{ ok: true }>(SOCIAL_API.block, { userId }),
	unblock: (userId: string) => postJson<{ ok: true }>(SOCIAL_API.unblock, { userId }),
	currentInvite: () => getJson<InviteInfo | null>(SOCIAL_API.invite),
	createInvite: () => postJson<InviteInfo>(SOCIAL_API.invite),
	revokeInvite: () => postJson<{ ok: true }>(SOCIAL_API.inviteRevoke),
	previewInvite: (token: string) => postJson<InvitePreview>(SOCIAL_API.invitePreview, { token }),
	redeemInvite: (token: string) => postJson<InvitePreview>(SOCIAL_API.inviteRedeem, { token }),
};

export function socialErrorMessage(err: unknown): string {
	if (err instanceof AuthedFetchError) {
		return socialActionErrorMessage(
			err.status === 429 ? "rate_limited" : socialErrorBody(err).reason,
		);
	}
	if (err instanceof TypeError) return "You're offline. Check your connection and try again.";
	return socialActionErrorMessage(undefined);
}

export function useRelationships(enabled = true) {
	return useQuery({
		queryKey: socialKeys.relationships,
		queryFn: friendsClient.relationships,
		enabled,
		...socialQueryDefaults,
	});
}

function useRelationshipMutation<TVariables>(run: (variables: TVariables) => Promise<unknown>) {
	const client = useQueryClient();
	return useMutation({
		mutationFn: run,
		onSuccess: () => client.invalidateQueries({ queryKey: socialKeys.relationships }),
	});
}

export function useRespondToRequest() {
	return useRelationshipMutation(friendsClient.respond);
}
export function useCancelRequest() {
	return useRelationshipMutation(friendsClient.cancel);
}
export function useRemoveFriend() {
	return useRelationshipMutation(friendsClient.remove);
}
export function useBlockUser() {
	return useRelationshipMutation(friendsClient.block);
}
export function useUnblockUser() {
	return useRelationshipMutation(friendsClient.unblock);
}

export function useCurrentInvite(enabled = true) {
	return useQuery({
		queryKey: socialKeys.invite,
		queryFn: friendsClient.currentInvite,
		enabled,
		...socialQueryDefaults,
	});
}

function useInviteMutation<TVariables>(
	run: (variables: TVariables) => Promise<InviteInfo | { ok: true }>,
) {
	const client = useQueryClient();
	return useMutation({
		mutationFn: run,
		onSuccess: (result) => client.setQueryData(socialKeys.invite, "url" in result ? result : null),
	});
}

export function useCreateInvite() {
	return useInviteMutation(() => friendsClient.createInvite());
}
export function useRevokeInvite() {
	return useInviteMutation(() => friendsClient.revokeInvite());
}

export function useInvitePreview(token: string, enabled = true) {
	return useQuery({
		queryKey: socialKeys.invitePreview(token),
		queryFn: () => friendsClient.previewInvite(token),
		enabled,
		...socialQueryDefaults,
		refetchOnWindowFocus: false,
	});
}

export function useRedeemInvite() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: friendsClient.redeemInvite,
		onSuccess: (preview, token) => {
			client.setQueryData(socialKeys.invitePreview(token), preview);
			void client.invalidateQueries({ queryKey: socialKeys.relationships });
		},
	});
}
