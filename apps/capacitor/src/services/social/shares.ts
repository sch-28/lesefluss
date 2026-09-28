import type { OutgoingShare, ShareBody, ShareRespondBody } from "@lesefluss/core";
import { SOCIAL_API, shareErrorMessage } from "@lesefluss/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AuthedFetchError, authedFetch } from "../authed-fetch";
import { socialKeys } from "../db/hooks/query-keys";
import { socialQueryDefaults } from "./cache";
import { socialErrorBody } from "./profile";

async function postJson<T>(path: string, body: unknown): Promise<T> {
	const res = await authedFetch(path, { method: "POST", body: JSON.stringify(body) });
	return res.json();
}

export const sharesClient = {
	forBook: async (bookId: string) => {
		const res = await authedFetch(
			`${SOCIAL_API.sharesForBook}?bookId=${encodeURIComponent(bookId)}`,
		);
		return res.json() as Promise<OutgoingShare[]>;
	},
	create: (body: ShareBody) => postJson<{ shareId: string }>(SOCIAL_API.share, body),
	revoke: (shareId: string) => postJson<{ ok: true }>(SOCIAL_API.shareRevoke, { shareId }),
	respond: (body: ShareRespondBody) =>
		postJson<{ bookId: string | null }>(SOCIAL_API.shareRespond, body),
};

export function shareErrorReason(err: unknown): string | undefined {
	return err instanceof AuthedFetchError
		? err.status === 429
			? "rate_limited"
			: socialErrorBody(err).reason
		: undefined;
}

export function shareFailureMessage(err: unknown): string {
	if (err instanceof TypeError) return "You're offline. Check your connection and try again.";
	return shareErrorMessage(shareErrorReason(err));
}

export function useSharesForBook(bookId: string, enabled = true) {
	return useQuery({
		queryKey: socialKeys.sharesForBook(bookId),
		queryFn: () => sharesClient.forBook(bookId),
		enabled,
		...socialQueryDefaults,
	});
}

export function useCreateShare() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: sharesClient.create,
		onSuccess: (_result, body) =>
			client.invalidateQueries({ queryKey: socialKeys.sharesForBook(body.bookId) }),
	});
}

export function useRevokeShare(bookId: string) {
	const client = useQueryClient();
	return useMutation({
		mutationFn: sharesClient.revoke,
		onSuccess: () => client.invalidateQueries({ queryKey: socialKeys.sharesForBook(bookId) }),
	});
}

export function useRespondToShare() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: sharesClient.respond,
		onSuccess: () => client.invalidateQueries({ queryKey: socialKeys.inbox }),
	});
}
