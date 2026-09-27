import type { InboxItem, ShareItemBook } from "@lesefluss/core";
import { isNotificationType } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { SocialAvatar } from "@lesefluss/ui/social-avatar";
import { Link } from "@tanstack/react-router";
import { CheckCheck, Flag, Inbox, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { Section } from "@/components/app-shell/section";
import CoverImage from "@/components/cover-image";
import { ReportSheet, type ReportTarget } from "@/components/social/report-sheet";
import { toast } from "@/components/toast";
import { useSyncContext } from "@/contexts/sync-context";
import { AuthedFetchError } from "@/services/authed-fetch";
import { getCoverUrl } from "@/services/catalog/client";
import { useIsOnline } from "@/services/social/cache";
import { socialErrorMessage, useRespondToRequest } from "@/services/social/friends";
import { useInbox, useMarkAllRead, useMarkRead } from "@/services/social/inbox";
import { shareFailureMessage, useRespondToShare } from "@/services/social/shares";
import { OfflineNotice, SocialGate, Spinner, StaleNotice } from "./social-gate";

function formatWhen(ms: number): string {
	const diff = Date.now() - ms;
	if (diff < 60_000) return "just now";
	if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
	if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h ago`;
	return new Date(ms).toLocaleDateString();
}

function describe(item: InboxItem): string {
	if (!isNotificationType(item.type)) return "did something new. Update the app to see it.";
	switch (item.type) {
		case "statement_of_reasons":
			return item.payload?.text ?? "made a decision about your account.";
		case "notice_decision":
			return item.payload?.text ?? "reviewed your report.";
		case "friend_request_received":
			switch (item.subject?.state) {
				case "accepted":
					return "sent you a friend request. You're friends now.";
				case "declined":
					return "sent you a friend request. You declined.";
				default:
					return "sent you a friend request.";
			}
		case "friend_request_accepted":
			return "accepted your friend request.";
		case "friend_joined_via_invite":
			return "joined through your invite link. You're friends now.";
		case "share_received":
			switch (item.subject?.kind === "share" ? item.subject.state : "unavailable") {
				case "accepted":
					return "shared a book with you. It's in your library.";
				case "declined":
					return "shared a book with you. You declined.";
				case "pending":
					return "shared a book with you.";
				default:
					return "shared a book with you. It's no longer available.";
			}
		case "share_accepted":
			return "accepted the book you shared.";
		case "share_removed":
			return item.payload?.text ?? "A book shared with you was removed.";
	}
}

function ShareBookCard({ book }: { book: ShareItemBook }) {
	const src = book.cover
		? book.cover.kind === "catalog"
			? getCoverUrl(book.cover.catalogId)
			: book.cover.url
		: null;
	return (
		<div className="mt-2 flex items-center gap-3 rounded-md border border-border bg-muted/30 p-2">
			<div className="h-14 w-10 shrink-0 overflow-hidden rounded-sm border border-border bg-muted">
				<CoverImage src={src} alt="" className="h-full w-full" />
			</div>
			<div className="min-w-0 flex-1">
				<div className="truncate font-medium text-foreground text-sm">{book.title}</div>
				<div className="truncate text-muted-foreground text-xs">
					{[book.author, book.wordCount ? `${book.wordCount.toLocaleString()} words` : null]
						.filter(Boolean)
						.join(" · ")}
				</div>
			</div>
		</div>
	);
}

/** A request resolved elsewhere comes back as not-found; that is the outcome we wanted. */
function isAlreadyResolved(err: unknown): boolean {
	return err instanceof AuthedFetchError && err.status === 404;
}

function InboxRow({
	item,
	isOffline,
	onReport,
}: {
	item: InboxItem;
	isOffline: boolean;
	onReport: (target: ReportTarget) => void;
}) {
	const markRead = useMarkRead();
	const respond = useRespondToRequest();
	const respondShare = useRespondToShare();
	const { syncNow } = useSyncContext();
	const isUnread = item.readAt === null;
	const canAct = item.subject?.kind === "friend_request" && item.subject.state === "pending";
	const share = item.subject?.kind === "share" ? item.subject : null;
	const canActShare = share?.state === "pending";
	// Only friends have a profile to open; a request's sender is not one yet.
	const hasProfile =
		item.actor !== null &&
		(item.type === "friend_request_accepted" ||
			item.type === "friend_joined_via_invite" ||
			item.type === "share_accepted" ||
			item.type === "share_received" ||
			item.subject?.state === "accepted");
	const actorName = item.actor?.name ?? "Lesefluss";

	const actShare = (action: "accept" | "decline") => {
		if (!share) return;
		respondShare.mutate(
			{ shareId: share.shareId, action },
			{
				onSuccess: () => {
					markRead.mutate(item.id);
					// The copy exists on the server now; pull it so it shows up without a manual sync.
					if (action === "accept") {
						syncNow().catch(() =>
							toast.error("Added, but the sync failed. The book arrives with the next sync."),
						);
					}
				},
				onError: (err) => {
					if (isAlreadyResolved(err)) markRead.mutate(item.id);
					else toast.error(shareFailureMessage(err));
				},
			},
		);
	};

	const act = (action: "accept" | "decline") => {
		if (item.subject?.kind !== "friend_request") return;
		respond.mutate(
			{ requestId: item.subject.requestId, action },
			{
				onSuccess: () => markRead.mutate(item.id),
				onError: (err) => {
					if (isAlreadyResolved(err)) markRead.mutate(item.id);
					else toast.error(socialErrorMessage(err));
				},
			},
		);
	};

	return (
		<div className="flex items-start gap-3 px-4 py-3">
			<span className="relative">
				{item.actor === null ? (
					<span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
						<ShieldCheck className="size-5" />
					</span>
				) : hasProfile ? (
					<Link to="/tabs/social/profile/$userId" params={{ userId: item.actor.userId }}>
						<SocialAvatar name={item.actor.name} avatarUrl={item.actor.avatarUrl} size="md" />
					</Link>
				) : (
					<SocialAvatar name={item.actor.name} avatarUrl={item.actor.avatarUrl} size="md" />
				)}
				{isUnread && (
					<span className="absolute top-0 right-0 size-2.5 rounded-full bg-primary">
						<span className="sr-only">Unread</span>
					</span>
				)}
			</span>
			<div className="min-w-0 flex-1">
				<button
					type="button"
					disabled={!isUnread || isOffline}
					onClick={() => markRead.mutate(item.id)}
					className="w-full text-left disabled:cursor-default"
				>
					<p className="whitespace-pre-line text-foreground text-sm">
						<span className="font-medium">{actorName}</span>
						{item.actor ? (
							<>
								{" "}
								<span className="text-muted-foreground">@{item.actor.handle}</span>{" "}
							</>
						) : (
							"\n"
						)}
						{describe(item)}
					</p>
					<p className="mt-0.5 text-muted-foreground text-xs">{formatWhen(item.createdAt)}</p>
				</button>
				{share && <ShareBookCard book={share.book} />}
				{share && item.actor && (
					<div className="mt-2 flex gap-2">
						{canActShare && (
							<>
								<Button
									size="sm"
									disabled={isOffline || respondShare.isPending}
									onClick={() => actShare("accept")}
								>
									Add to library
								</Button>
								<Button
									size="sm"
									variant="ghost"
									disabled={isOffline || respondShare.isPending}
									onClick={() => actShare("decline")}
								>
									Decline
								</Button>
							</>
						)}
						<Button
							size="sm"
							variant="ghost"
							aria-label="Report"
							disabled={respondShare.isPending}
							onClick={() =>
								item.actor &&
								share &&
								onReport({
									type: "shared_book",
									userId: item.actor.userId,
									name: item.actor.name,
									subjectId: share.shareId,
								})
							}
						>
							<Flag className="size-4" />
						</Button>
					</div>
				)}
				{canAct && (
					<div className="mt-2 flex gap-2">
						<Button
							size="sm"
							disabled={isOffline || respond.isPending}
							onClick={() => act("accept")}
						>
							Accept
						</Button>
						<Button
							size="sm"
							variant="ghost"
							disabled={isOffline || respond.isPending}
							onClick={() => act("decline")}
						>
							Decline
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}

function InboxContent() {
	const isOnline = useIsOnline();
	const inbox = useInbox();
	const markAll = useMarkAllRead();
	const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
	const items = inbox.data?.pages.flatMap((p) => p.items) ?? [];
	const hasUnread = items.some((i) => i.readAt === null);

	if (inbox.isPending) return <Spinner />;
	if (inbox.isError && !inbox.data) {
		return (
			<OfflineNotice onRetry={() => void inbox.refetch()}>
				{isOnline
					? "Couldn't load your inbox. Try again."
					: "You're offline. Your inbox will show once you're back online."}
			</OfflineNotice>
		);
	}
	return (
		<>
			<StaleNotice
				isOnline={isOnline}
				isError={inbox.isError}
				onRetry={() => void inbox.refetch()}
			/>
			<Section
				title="Inbox"
				action={
					hasUnread ? (
						<button
							type="button"
							disabled={!isOnline || markAll.isPending}
							onClick={() =>
								markAll.mutate(undefined, {
									onError: (err) => toast.error(socialErrorMessage(err)),
								})
							}
							className="flex items-center gap-1 text-primary text-xs disabled:opacity-50"
						>
							<CheckCheck className="size-3.5" />
							Mark all read
						</button>
					) : undefined
				}
			>
				{items.length === 0 ? (
					<div className="px-4 py-8 text-center">
						<Inbox className="mx-auto mb-2 size-6 text-muted-foreground" />
						<p className="text-muted-foreground text-sm">Nothing here yet.</p>
					</div>
				) : (
					items.map((item) => (
						<InboxRow key={item.id} item={item} isOffline={!isOnline} onReport={setReportTarget} />
					))
				)}
			</Section>
			<ReportSheet target={reportTarget} onClose={() => setReportTarget(null)} />
			{inbox.hasNextPage && (
				<Button
					variant="outline"
					className="mt-4 w-full"
					disabled={!isOnline || inbox.isFetchingNextPage}
					onClick={() => void inbox.fetchNextPage()}
				>
					{inbox.isFetchingNextPage ? "Loading…" : "Load more"}
				</Button>
			)}
		</>
	);
}

export default function InboxPage() {
	return (
		<div className="bg-background">
			<PageHeader title="Inbox" icon={Inbox} />
			<div className="mx-auto max-w-2xl px-4 pb-10">
				<SocialGate returnTo="/tabs/social/inbox">
					<InboxContent />
				</SocialGate>
			</div>
		</div>
	);
}
