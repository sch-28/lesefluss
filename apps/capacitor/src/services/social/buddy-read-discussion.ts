import type { BuddyReaction, DiscussionAnchor, DiscussionPage } from "@lesefluss/core";
import { discussionErrorMessage, SOCIAL_API } from "@lesefluss/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AuthedFetchError, authedFetch } from "../authed-fetch";
import { bookKeys, socialKeys } from "../db/hooks/query-keys";
import { queries } from "../db/queries";
import type { Highlight } from "../db/schema";
import { socialQueryDefaults } from "./cache";
import { socialErrorBody } from "./profile";

async function postJson<T>(path: string, body: unknown): Promise<T> {
	const res = await authedFetch(path, { method: "POST", body: JSON.stringify(body) });
	return res.json();
}

export const discussionClient = {
	get: async (buddyReadId: string) => {
		const res = await authedFetch(
			`${SOCIAL_API.buddyReadDiscussion}?id=${encodeURIComponent(buddyReadId)}`,
		);
		return res.json() as Promise<DiscussionPage>;
	},
	post: (body: { buddyReadId: string; anchor: DiscussionAnchor; body: string }) =>
		postJson<{ commentId: string }>(SOCIAL_API.buddyReadComment, body),
	reply: (body: { parentId: string; body: string }) =>
		postJson<{ commentId: string }>(SOCIAL_API.buddyReadCommentReply, body),
	edit: (body: { commentId: string; body: string }) =>
		postJson<{ ok: true }>(SOCIAL_API.buddyReadCommentEdit, body),
	remove: (commentId: string) =>
		postJson<{ ok: true }>(SOCIAL_API.buddyReadCommentDelete, { commentId }),
	share: (body: { buddyReadId: string; highlightId: string }) =>
		postJson<{ sharedHighlightId: string }>(SOCIAL_API.buddyReadHighlightShare, body),
	unshare: (sharedHighlightId: string) =>
		postJson<{ ok: true }>(SOCIAL_API.buddyReadHighlightUnshare, { sharedHighlightId }),
	react: (body: ReactionTarget & { emoji: BuddyReaction; remove: boolean }) => {
		const { remove, ...rest } = body;
		return postJson<{ ok: true }>(
			remove ? SOCIAL_API.buddyReadReactionRemove : SOCIAL_API.buddyReadReaction,
			rest,
		);
	},
	settings: (body: {
		buddyReadId: string;
		shareAllHighlights?: boolean;
		showEverything?: boolean;
	}) => postJson<{ ok: true }>(SOCIAL_API.buddyReadDiscussionSettings, body),
};

export type ReactionTarget = { commentId?: string; sharedHighlightId?: string };

export function discussionFailureMessage(err: unknown): string {
	if (err instanceof TypeError) return "You're offline. Check your connection and try again.";
	if (err instanceof AuthedFetchError) {
		return discussionErrorMessage(
			err.status === 429 ? "rate_limited" : socialErrorBody(err).reason,
		);
	}
	return discussionErrorMessage(undefined);
}

export function useDiscussion(buddyReadId: string | null, options: { poll?: boolean } = {}) {
	return useQuery({
		queryKey: socialKeys.buddyReadDiscussion(buddyReadId ?? ""),
		queryFn: () => discussionClient.get(buddyReadId ?? ""),
		enabled: buddyReadId !== null,
		...socialQueryDefaults,
		refetchInterval: options.poll ? 60_000 : false,
		refetchIntervalInBackground: false,
	});
}

function useDiscussionMutation<TVariables, TResult>(
	buddyReadId: string,
	run: (variables: TVariables) => Promise<TResult>,
) {
	const client = useQueryClient();
	return useMutation({
		mutationFn: run,
		onSuccess: () =>
			client.invalidateQueries({ queryKey: socialKeys.buddyReadDiscussion(buddyReadId) }),
	});
}

export const usePostComment = (id: string) => useDiscussionMutation(id, discussionClient.post);
export const useReplyToComment = (id: string) => useDiscussionMutation(id, discussionClient.reply);
export const useEditComment = (id: string) => useDiscussionMutation(id, discussionClient.edit);
export const useDeleteComment = (id: string) => useDiscussionMutation(id, discussionClient.remove);
export const useReact = (id: string) => useDiscussionMutation(id, discussionClient.react);
export const useUnshareHighlight = (id: string) =>
	useDiscussionMutation(id, discussionClient.unshare);
export const useDiscussionSettings = (id: string) =>
	useDiscussionMutation(id, discussionClient.settings);

/**
 * The server only knows a highlight after a push, and only accepts one with
 * its text. A highlight made before text was stored gets it filled in here.
 */
export function useShareHighlight(buddyReadId: string, syncNow: () => Promise<void>) {
	const client = useQueryClient();
	return useDiscussionMutation(
		buddyReadId,
		async (input: { highlight: Highlight; text: string }) => {
			// The server refuses a highlight without text, and older highlights have none.
			if (!input.highlight.text && input.text) {
				await queries.updateHighlight(input.highlight.id, {
					text: input.text,
					updatedAt: Date.now(),
				});
				await client.invalidateQueries({ queryKey: bookKeys.highlights(input.highlight.bookId) });
			}
			await syncNow();
			return discussionClient.share({ buddyReadId, highlightId: input.highlight.id });
		},
	);
}
