import type { InboxPage, UnreadCount } from "@lesefluss/core";
import { SOCIAL_API } from "@lesefluss/core";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authedFetch } from "../authed-fetch";
import { socialKeys } from "../db/hooks/query-keys";
import { socialQueryDefaults } from "./cache";

async function getJson<T>(path: string): Promise<T> {
	const res = await authedFetch(path);
	return res.json();
}

async function postJson<T>(path: string, body: unknown = {}): Promise<T> {
	const res = await authedFetch(path, { method: "POST", body: JSON.stringify(body) });
	return res.json();
}

export const inboxClient = {
	page: (cursor: string | null) =>
		getJson<InboxPage>(
			cursor ? `${SOCIAL_API.inbox}?cursor=${encodeURIComponent(cursor)}` : SOCIAL_API.inbox,
		),
	unreadCount: () => getJson<UnreadCount>(SOCIAL_API.inboxUnreadCount),
	markRead: (id: string) => postJson<{ ok: true }>(SOCIAL_API.inboxRead, { id }),
	markAllRead: () => postJson<{ ok: true }>(SOCIAL_API.inboxReadAll),
};

export function useInbox(enabled = true) {
	return useInfiniteQuery({
		queryKey: socialKeys.inbox,
		queryFn: ({ pageParam }) => inboxClient.page(pageParam),
		initialPageParam: null as string | null,
		getNextPageParam: (last) => last.nextCursor,
		enabled,
		...socialQueryDefaults,
	});
}

export function useUnreadCount(enabled = true) {
	return useQuery({
		queryKey: socialKeys.unread,
		queryFn: inboxClient.unreadCount,
		enabled,
		...socialQueryDefaults,
	});
}

function markPagesRead(pages: InboxPage[] | undefined, ids: Set<string> | "all", at: number) {
	return pages?.map((page) => ({
		...page,
		items: page.items.map((item) =>
			item.readAt === null && (ids === "all" || ids.has(item.id)) ? { ...item, readAt: at } : item,
		),
	}));
}

type InboxCache = { pages: InboxPage[]; pageParams: unknown[] } | undefined;

export function useMarkRead() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: inboxClient.markRead,
		onSuccess: (_, id) => {
			const at = Date.now();
			client.setQueryData<InboxCache>(socialKeys.inbox, (cache) =>
				cache ? { ...cache, pages: markPagesRead(cache.pages, new Set([id]), at) ?? [] } : cache,
			);
			void client.invalidateQueries({ queryKey: socialKeys.unread });
		},
	});
}

export function useMarkAllRead() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: inboxClient.markAllRead,
		onSuccess: () => {
			const at = Date.now();
			client.setQueryData<InboxCache>(socialKeys.inbox, (cache) =>
				cache ? { ...cache, pages: markPagesRead(cache.pages, "all", at) ?? [] } : cache,
			);
			client.setQueryData<UnreadCount>(socialKeys.unread, { count: 0 });
		},
	});
}
