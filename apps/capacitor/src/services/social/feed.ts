import type { FeedPage } from "@lesefluss/core";
import { SOCIAL_API } from "@lesefluss/core";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authedFetch } from "../authed-fetch";
import { socialKeys } from "../db/hooks/query-keys";
import { socialQueryDefaults } from "./cache";
import { deviceTimeZone } from "./profile-view";

type FeedCache = { pages: FeedPage[]; pageParams: unknown[] } | undefined;

export const feedClient = {
	page: async (cursor: string | null): Promise<FeedPage> => {
		const params = new URLSearchParams();
		if (cursor) params.set("cursor", cursor);
		const tz = deviceTimeZone();
		if (tz) params.set("tz", tz);
		const res = await authedFetch(`${SOCIAL_API.feed}?${params}`);
		return res.json();
	},
	remove: async (eventId: string) => {
		await authedFetch(SOCIAL_API.feedDelete, {
			method: "POST",
			body: JSON.stringify({ eventId }),
		});
	},
};

export function useFeed(enabled = true) {
	return useInfiniteQuery({
		queryKey: socialKeys.feed,
		queryFn: ({ pageParam }) => feedClient.page(pageParam),
		initialPageParam: null as string | null,
		getNextPageParam: (last) => last.nextCursor,
		enabled,
		...socialQueryDefaults,
	});
}

export function useDeleteFeedEvent() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: feedClient.remove,
		onSuccess: (_, eventId) =>
			client.setQueryData<FeedCache>(socialKeys.feed, (cache) =>
				cache
					? {
							...cache,
							pages: cache.pages.map((p) => ({
								...p,
								items: p.items.filter((i) => i.id !== eventId),
							})),
						}
					: cache,
			),
	});
}
