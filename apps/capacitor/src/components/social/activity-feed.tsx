import { type FeedItem, ratingStars } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@lesefluss/ui/drawer";
import { SocialAvatar } from "@lesefluss/ui/social-avatar";
import { Link } from "@tanstack/react-router";
import { MoreHorizontal, Newspaper, Trash2 } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { ActionSheet } from "@/components/action-sheet";
import CoverImage from "@/components/cover-image";
import { toast } from "@/components/toast";
import { OfflineNotice, StaleNotice } from "@/pages/social/social-gate";
import { useIsOnline } from "@/services/social/cache";
import { useDeleteFeedEvent, useFeed } from "@/services/social/feed";
import { localDateKey, previousLocalDayStart, startOfLocalDay } from "@/utils/date-utils";
import { ListCard, profileCoverSrc, SocialSection } from "./social-ui";

/** "Today", "Yesterday" or a date. Never a time: the feed must not tell when someone reads. */
function dayLabel(day: string, now = Date.now()): string {
	if (day === localDateKey(now)) return "Today";
	if (day === localDateKey(previousLocalDayStart(startOfLocalDay(now)))) return "Yesterday";
	const [y, m, d] = day.split("-").map(Number);
	return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1).toLocaleDateString(undefined, {
		day: "numeric",
		month: "short",
	});
}

function dayPhrase(day: string): string {
	const label = dayLabel(day);
	return label === "Today" || label === "Yesterday" ? label.toLowerCase() : `on ${label}`;
}

function BookCover({ item }: { item: FeedItem }) {
	return (
		<div className="relative aspect-[2/3] w-10 shrink-0 overflow-hidden rounded bg-muted">
			<CoverImage src={profileCoverSrc(item.book.cover)} alt="" />
		</div>
	);
}

function FeedRow({
	item,
	isOffline,
	onBook,
	onMenu,
}: {
	item: FeedItem;
	isOffline: boolean;
	onBook: () => void;
	onMenu: () => void;
}) {
	const who = item.isOwn ? "You" : item.actor.name;
	const verb = item.type === "finished" ? "finished" : "started";
	const avatar = <SocialAvatar name={item.actor.name} avatarUrl={item.actor.avatarUrl} size="sm" />;
	const book = (
		<span className="flex min-w-0 items-center gap-3 text-left">
			<BookCover item={item} />
			<span className="min-w-0">
				<span className="line-clamp-1 font-medium text-foreground text-sm">{item.book.title}</span>
				{item.book.author && (
					<span className="line-clamp-1 text-muted-foreground text-xs">{item.book.author}</span>
				)}
				{item.book.rating !== null && (
					<span className="text-muted-foreground text-xs">★ {ratingStars(item.book.rating)}</span>
				)}
			</span>
		</span>
	);
	return (
		<div className="px-4 py-3">
			<div className="flex items-center gap-2">
				{item.isOwn ? (
					avatar
				) : (
					<Link
						to="/tabs/social/profile/$userId"
						params={{ userId: item.actor.userId }}
						aria-label={item.actor.name}
					>
						{avatar}
					</Link>
				)}
				<p className="m-0 min-w-0 flex-1 text-foreground text-sm">
					<span className="font-medium">{who}</span> {verb} a book
					<span className="text-muted-foreground"> · {dayLabel(item.day)}</span>
				</p>
				{item.isOwn && (
					<Button
						variant="ghost"
						size="icon"
						aria-label="More"
						disabled={isOffline}
						onClick={onMenu}
					>
						<MoreHorizontal className="size-4" />
					</Button>
				)}
			</div>
			<div className="mt-2 pl-10">
				{item.book.catalogId ? (
					<Link
						to="/tabs/explore/book/$catalogId"
						params={{ catalogId: item.book.catalogId }}
						className="no-underline"
					>
						{book}
					</Link>
				) : (
					<button type="button" className="w-full" onClick={onBook}>
						{book}
					</button>
				)}
			</div>
		</div>
	);
}

/** Your and your friends' reading activity, newest first. */
export function ActivityFeed({ hasFriends }: { hasFriends: boolean }) {
	const isOnline = useIsOnline();
	const feed = useFeed();
	const remove = useDeleteFeedEvent();
	const [menuFor, setMenuFor] = useState<FeedItem | null>(null);
	const [details, setDetails] = useState<FeedItem | null>(null);
	const items = feed.data?.pages.flatMap((p) => p.items) ?? [];

	let body: React.ReactNode;
	if (feed.isPending) {
		body = (
			<ListCard>
				{[0, 1, 2].map((i) => (
					<div key={i} className="flex items-center gap-3 px-4 py-3">
						<div className="size-8 animate-pulse rounded-full bg-muted" />
						<div className="h-3 flex-1 animate-pulse rounded bg-muted" />
					</div>
				))}
			</ListCard>
		);
	} else if (feed.isError && !feed.data) {
		body = (
			<OfflineNotice onRetry={() => void feed.refetch()}>
				{isOnline
					? "Couldn't load the activity. Try again."
					: "You're offline. Activity shows once you're back online."}
			</OfflineNotice>
		);
	} else if (items.length === 0) {
		body = (
			<div className="rounded-xl border border-current/10 bg-card px-4 py-6 text-center">
				<Newspaper className="mx-auto mb-2 size-6 text-muted-foreground" />
				<p className="m-0 text-muted-foreground text-sm">
					{hasFriends
						? "Nothing yet. When your friends start or finish a book and share their reading, it shows here."
						: "Add friends to see what they start and finish reading."}
				</p>
				{!hasFriends && (
					<Button asChild size="sm" className="mt-3">
						<Link to="/tabs/social/invite-link">Create invite link</Link>
					</Button>
				)}
			</div>
		);
	} else {
		body = (
			<>
				<StaleNotice
					isOnline={isOnline}
					isError={feed.isError}
					onRetry={() => void feed.refetch()}
				/>
				<ListCard>
					{items.map((item) => (
						<FeedRow
							key={item.id}
							item={item}
							isOffline={!isOnline}
							onBook={() => setDetails(item)}
							onMenu={() => setMenuFor(item)}
						/>
					))}
				</ListCard>
				{feed.hasNextPage && (
					<Button
						variant="outline"
						className="mt-3 w-full"
						disabled={!isOnline || feed.isFetchingNextPage}
						onClick={() => void feed.fetchNextPage()}
					>
						{feed.isFetchingNextPage ? "Loading…" : "Load more"}
					</Button>
				)}
			</>
		);
	}

	return (
		<SocialSection title="Activity">
			{body}
			<ActionSheet
				open={menuFor !== null}
				onOpenChange={(open) => !open && setMenuFor(null)}
				items={[
					{
						label: "Remove from feed",
						icon: Trash2,
						destructive: true,
						onSelect: () =>
							menuFor &&
							remove.mutate(menuFor.id, {
								onError: () => toast.error("Couldn't remove it. Try again."),
							}),
					},
				]}
			/>
			<Drawer open={details !== null} onOpenChange={(open) => !open && setDetails(null)}>
				<DrawerContent>
					<DrawerHeader>
						<DrawerTitle>{details?.book.title}</DrawerTitle>
					</DrawerHeader>
					{details && (
						<div className="flex gap-4 px-4 pb-8">
							<div className="relative aspect-[2/3] w-24 shrink-0 overflow-hidden rounded-lg bg-muted">
								<CoverImage src={profileCoverSrc(details.book.cover)} alt="" />
							</div>
							<div className="min-w-0 text-sm">
								{details.book.author && (
									<p className="m-0 text-muted-foreground">{details.book.author}</p>
								)}
								{details.book.rating !== null && (
									<p className="m-0 mt-1 text-muted-foreground">
										★ {ratingStars(details.book.rating)}
									</p>
								)}
								<p className="m-0 mt-3 text-muted-foreground text-xs">
									{details.isOwn ? "You" : details.actor.name}{" "}
									{details.type === "finished" ? "finished" : "started"} this book{" "}
									{dayPhrase(details.day)}.
								</p>
							</div>
						</div>
					)}
				</DrawerContent>
			</Drawer>
		</SocialSection>
	);
}
