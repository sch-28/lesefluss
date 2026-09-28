import type {
	BuddyReadDetail,
	BuddyReadProgress,
	BuddyReadSummary,
	CreateBuddyReadBody,
	RelationshipState,
} from "@lesefluss/core";
import { BUDDY_READ_PROGRESS_REFRESH_MS, buddyReadErrorMessage, SOCIAL_API } from "@lesefluss/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AuthedFetchError, authedFetch } from "../authed-fetch";
import { socialKeys } from "../db/hooks/query-keys";
import { socialQueryDefaults } from "./cache";
import { socialErrorBody } from "./profile";

async function getJson<T>(path: string): Promise<T> {
	const res = await authedFetch(path);
	return res.json();
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
	const res = await authedFetch(path, { method: "POST", body: JSON.stringify(body) });
	return res.json();
}

export const buddyReadsClient = {
	list: () => getJson<BuddyReadSummary[]>(SOCIAL_API.buddyReads),
	get: (id: string) =>
		getJson<BuddyReadDetail>(`${SOCIAL_API.buddyReadDetail}?id=${encodeURIComponent(id)}`),
	progress: (id: string) =>
		getJson<BuddyReadProgress>(`${SOCIAL_API.buddyReadProgress}?id=${encodeURIComponent(id)}`),
	create: (body: CreateBuddyReadBody) =>
		postJson<{ buddyReadId: string }>(SOCIAL_API.buddyReadCreate, body),
	invite: (body: { buddyReadId: string; inviteeIds: string[] }) =>
		postJson<{ ok: true }>(SOCIAL_API.buddyReadInvite, body),
	cancelInvite: (inviteId: string) =>
		postJson<{ ok: true }>(SOCIAL_API.buddyReadInviteCancel, { inviteId }),
	respond: (body: { inviteId: string; action: "accept" | "decline" }) =>
		postJson<{ buddyReadId: string; bookId: string | null }>(
			SOCIAL_API.buddyReadInviteRespond,
			body,
		),
	leave: (buddyReadId: string) =>
		postJson<{ ok: true }>(SOCIAL_API.buddyReadLeave, { buddyReadId }),
	removeMember: (body: { buddyReadId: string; userId: string }) =>
		postJson<{ ok: true }>(SOCIAL_API.buddyReadRemoveMember, body),
	setTargetDate: (body: { buddyReadId: string; targetDate: number | null }) =>
		postJson<{ ok: true }>(SOCIAL_API.buddyReadTargetDate, body),
	sendFriendRequest: (userId: string) =>
		postJson<{ state: RelationshipState }>(SOCIAL_API.friendRequest, { userId }),
};

export function buddyReadFailureMessage(err: unknown): string {
	if (err instanceof TypeError) return "You're offline. Check your connection and try again.";
	if (err instanceof AuthedFetchError) {
		return buddyReadErrorMessage(err.status === 429 ? "rate_limited" : socialErrorBody(err).reason);
	}
	return buddyReadErrorMessage(undefined);
}

export function buddyReadErrorReason(err: unknown): string | undefined {
	return err instanceof AuthedFetchError ? socialErrorBody(err).reason : undefined;
}

export function useBuddyReads(enabled = true) {
	return useQuery({
		queryKey: socialKeys.buddyReads,
		queryFn: buddyReadsClient.list,
		enabled,
		...socialQueryDefaults,
	});
}

export function useBuddyRead(id: string, enabled = true) {
	return useQuery({
		queryKey: socialKeys.buddyRead(id),
		queryFn: () => buddyReadsClient.get(id),
		enabled,
		...socialQueryDefaults,
	});
}

/**
 * Polled at most once a minute and only while `active`: the caller turns it
 * off while the app is in the background or offline.
 */
export function useBuddyReadProgress(id: string | null, active: boolean) {
	return useQuery({
		queryKey: socialKeys.buddyReadProgress(id ?? ""),
		queryFn: () => buddyReadsClient.progress(id ?? ""),
		enabled: id !== null && active,
		staleTime: BUDDY_READ_PROGRESS_REFRESH_MS,
		gcTime: 24 * 60 * 60_000,
		retry: 1,
		refetchInterval: active ? BUDDY_READ_PROGRESS_REFRESH_MS : false,
		refetchIntervalInBackground: false,
		refetchOnWindowFocus: false,
		refetchOnMount: true,
	});
}

/** Every buddy-read mutation changes the list and the one read it touched. */
function useBuddyReadMutation<TVariables, TResult>(
	run: (variables: TVariables) => Promise<TResult>,
	readIdOf: (variables: TVariables, result: TResult) => string | null,
) {
	const client = useQueryClient();
	return useMutation({
		mutationFn: run,
		onSuccess: (result, variables) => {
			void client.invalidateQueries({ queryKey: socialKeys.buddyReads });
			const id = readIdOf(variables, result);
			if (id) void client.invalidateQueries({ queryKey: socialKeys.buddyRead(id) });
		},
	});
}

export function useCreateBuddyRead() {
	return useBuddyReadMutation(buddyReadsClient.create, (_v, r) => r.buddyReadId);
}
export function useInviteToBuddyRead() {
	return useBuddyReadMutation(buddyReadsClient.invite, (v) => v.buddyReadId);
}
export function useCancelBuddyReadInvite(buddyReadId: string) {
	return useBuddyReadMutation(buddyReadsClient.cancelInvite, () => buddyReadId);
}
export function useLeaveBuddyRead() {
	return useBuddyReadMutation(buddyReadsClient.leave, (id) => id);
}
export function useRemoveBuddyReadMember() {
	return useBuddyReadMutation(buddyReadsClient.removeMember, (v) => v.buddyReadId);
}
export function useSetBuddyReadTargetDate() {
	return useBuddyReadMutation(buddyReadsClient.setTargetDate, (v) => v.buddyReadId);
}

export function useRespondToBuddyReadInvite() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: buddyReadsClient.respond,
		onSuccess: () => {
			void client.invalidateQueries({ queryKey: socialKeys.inbox });
			void client.invalidateQueries({ queryKey: socialKeys.buddyReads });
		},
	});
}

/** A friend request to a co-participant; the returned state replaces the row's action. */
export function useSendFriendRequest(buddyReadId: string) {
	const client = useQueryClient();
	return useMutation({
		mutationFn: buddyReadsClient.sendFriendRequest,
		onSuccess: () => {
			void client.invalidateQueries({ queryKey: socialKeys.buddyRead(buddyReadId) });
			void client.invalidateQueries({ queryKey: socialKeys.relationships });
		},
	});
}

export function paceText(onPace: boolean): string {
	return onPace ? "on track" : "a little behind";
}
