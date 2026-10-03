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
	const avatar = (
		<span className="block rounded-full bg-background ring-4 ring-background">
			<SocialAvatar name={item.actor.name} avatarUrl={item.actor.avatarUrl} size="sm" />
		</span>
	);
	const book = (
		<span className="flex min-w-0 items-center gap-3 text-left">
			<span className="min-w-0 flex-1">
				<span className="line-clamp-1 font-semibold text-foreground text-sm">
					{item.book.title}
				</span>
				{item.book.author && (
					<span className="line-clamp-1 text-muted-foreground text-xs">{item.book.author}</span>
				)}
				{item.book.rating !== null && (
					<span className="text-muted-foreground text-xs">★ {ratingStars(item.book.rating)}</span>
				)}
			</span>
			<span className="relative aspect-[2/3] w-9 shrink-0 overflow-hidden rounded bg-muted">
				<CoverImage src={profileCoverSrc(item.book.cover)} alt="" />
			</span>
		</span>
	);
	return (
		<li className="relative flex gap-3 pb-5">
			<div className="relative z-10 shrink-0">
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
			</div>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<p className="m-0 min-w-0 flex-1 text-foreground text-sm">
						<span className="font-semibold">{who}</span> {verb} a book
						<span className="text-muted-foreground"> · {dayLabel(item.day)}</span>
					</p>
					{item.isOwn && (
						<Button
							variant="ghost"
							size="icon"
							className="-my-2"
							aria-label="More"
							disabled={isOffline}
							onClick={onMenu}
						>
							<MoreHorizontal className="size-4" />
						</Button>
					)}
				</div>
				<div className="mt-1.5 rounded-xl bg-muted/60 px-3 py-2">
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
		</li>
	);
}

/** Your and your friends' reading activity, newest first. */
export function ActivityFeed({ isHiddenWhenEmpty = false }: { isHiddenWhenEmpty?: boolean }) {
	const isOnline = useIsOnline();
	const feed = useFeed();
	const remove = useDeleteFeedEvent();
	const [menuFor, setMenuFor] = useState<FeedItem | null>(null);
	const [details, setDetails] = useState<FeedItem | null>(null);
	const items = feed.data?.pages.flatMap((p) => p.items) ?? [];
	if (isHiddenWhenEmpty && items.length === 0) return null;

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
			<div className="rounded-2xl border border-border border-dashed px-4 py-5 text-center">
				<Newspaper className="mx-auto mb-2 size-5 text-muted-foreground" />
				<p className="m-0 text-muted-foreground text-sm">
					When your friends start or finish a book and share their reading, it shows here.
				</p>
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
				<div className="relative mt-1">
					<div aria-hidden="true" className="absolute top-2 bottom-6 left-[15px] w-px bg-border" />
					<ol className="relative m-0 list-none p-0">
						{items.map((item) => (
							<FeedRow
								key={item.id}
								item={item}
								isOffline={!isOnline}
								onBook={() => setDetails(item)}
								onMenu={() => setMenuFor(item)}
							/>
						))}
					</ol>
				</div>
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
