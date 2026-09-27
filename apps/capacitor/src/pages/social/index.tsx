import type { SocialIdentity, SocialRelationships } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { Link, useRouter } from "@tanstack/react-router";
import {
	Ban,
	ChevronRight,
	Flag,
	Inbox,
	Link2,
	MoreHorizontal,
	Newspaper,
	ShieldOff,
	UserMinus,
	Users,
} from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { ActionSheet, type ActionSheetItem } from "@/components/action-sheet";
import { EmptyRow, Section } from "@/components/app-shell/section";
import { TabHeader } from "@/components/app-shell/tab-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ReportSheet, type ReportTarget } from "@/components/social/report-sheet";
import { toast } from "@/components/toast";
import { replayPendingLink } from "@/services/deep-links/use-deep-links";
import { useIsOnline } from "@/services/social/cache";
import {
	socialErrorMessage,
	useBlockUser,
	useCancelRequest,
	useRelationships,
	useRemoveFriend,
	useRespondToRequest,
} from "@/services/social/friends";
import { useUnreadCount } from "@/services/social/inbox";
import { PersonRow } from "./person-row";
import { OfflineNotice, SocialGate, Spinner, StaleNotice } from "./social-gate";

type Confirm = {
	title: string;
	description: string;
	confirmLabel: string;
	destructive?: boolean;
	run: () => void;
};

const NOT_NOTIFIED = "They are not notified.";

function SocialLists({
	data,
	isOffline,
	unreadCount,
}: {
	data: SocialRelationships;
	isOffline: boolean;
	unreadCount: number;
}) {
	const respond = useRespondToRequest();
	const cancel = useCancelRequest();
	const remove = useRemoveFriend();
	const block = useBlockUser();
	const [menu, setMenu] = useState<{ title: string; items: ActionSheetItem[] } | null>(null);
	const [confirm, setConfirm] = useState<Confirm | null>(null);
	const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
	const reportItem = (person: SocialIdentity): ActionSheetItem => ({
		label: "Report",
		icon: Flag,
		onSelect: () => setReportTarget({ type: "profile", userId: person.userId, name: person.name }),
	});
	const isPending = respond.isPending || cancel.isPending || remove.isPending || block.isPending;
	const isBusy = isOffline || isPending;
	const onError = (err: unknown) => toast.error(socialErrorMessage(err));

	const friendMenu = (person: SocialIdentity) =>
		setMenu({
			title: person.name,
			items: [
				{
					label: "Remove friend",
					icon: UserMinus,
					disabled: isOffline,
					onSelect: () =>
						setConfirm({
							title: `Remove ${person.name}?`,
							description: `You disappear from each other's friend lists. ${NOT_NOTIFIED}`,
							confirmLabel: "Remove",
							destructive: true,
							run: () => remove.mutate(person.userId, { onError }),
						}),
				},
				reportItem(person),
				{
					label: "Block",
					icon: Ban,
					destructive: true,
					disabled: isOffline,
					onSelect: () =>
						setConfirm({
							title: `Block ${person.name}?`,
							description: `Ends the friendship and stops any further contact in both directions. ${NOT_NOTIFIED} You can unblock later from Blocked users.`,
							confirmLabel: "Block",
							destructive: true,
							run: () => block.mutate(person.userId, { onError }),
						}),
				},
			],
		});

	const incomingMenu = (person: SocialIdentity, requestId: string) =>
		setMenu({
			title: person.name,
			items: [
				reportItem(person),
				{
					label: "Decline and block",
					icon: Ban,
					destructive: true,
					disabled: isOffline,
					onSelect: () =>
						setConfirm({
							title: `Block ${person.name}?`,
							description: `Declines the request and stops any further contact in both directions. ${NOT_NOTIFIED}`,
							confirmLabel: "Decline and block",
							destructive: true,
							run: () => respond.mutate({ requestId, action: "decline_block" }, { onError }),
						}),
				},
			],
		});

	const menuButton = (onClick: () => void) => (
		// Stays usable offline: Report must be reachable so the failed send can say so.
		<Button variant="ghost" size="icon" onClick={onClick} disabled={isPending} aria-label="More">
			<MoreHorizontal className="size-4" />
		</Button>
	);

	return (
		<>
			<Section title="Requests">
				{data.incoming.length === 0 ? (
					<EmptyRow>No requests right now.</EmptyRow>
				) : (
					data.incoming.map((r) => (
						<PersonRow
							key={r.requestId}
							person={r}
							trailing={
								<div className="flex items-center gap-1">
									<Button
										size="sm"
										disabled={isBusy}
										onClick={() =>
											respond.mutate({ requestId: r.requestId, action: "accept" }, { onError })
										}
									>
										Accept
									</Button>
									<Button
										size="sm"
										variant="ghost"
										disabled={isBusy}
										onClick={() =>
											respond.mutate({ requestId: r.requestId, action: "decline" }, { onError })
										}
									>
										Decline
									</Button>
									{menuButton(() => incomingMenu(r, r.requestId))}
								</div>
							}
						/>
					))
				)}
			</Section>

			<Section
				title="Friends"
				action={
					<Link
						to="/tabs/social/invite-link"
						className="flex items-center gap-1 text-primary text-xs no-underline"
					>
						<Link2 className="size-3.5" />
						Add friend
					</Link>
				}
			>
				{data.friends.length === 0 ? (
					<div className="px-4 py-6 text-center">
						<Users className="mx-auto mb-2 size-6 text-muted-foreground" />
						<p className="text-muted-foreground text-sm">
							No friends yet. Share your invite link with someone you read with.
						</p>
						<Button asChild size="sm" className="mt-3">
							<Link to="/tabs/social/invite-link">Create invite link</Link>
						</Button>
					</div>
				) : (
					data.friends.map((f) => (
						<PersonRow
							key={f.userId}
							person={f}
							linkToProfile
							trailing={menuButton(() => friendMenu(f))}
						/>
					))
				)}
			</Section>

			{data.outgoing.length > 0 && (
				<Section title="Sent requests">
					{data.outgoing.map((r) => (
						<PersonRow
							key={r.requestId}
							person={r}
							subtitle="Pending"
							trailing={
								<Button
									size="sm"
									variant="ghost"
									disabled={isBusy}
									onClick={() => cancel.mutate(r.requestId, { onError })}
								>
									Cancel
								</Button>
							}
						/>
					))}
				</Section>
			)}

			<Section title="Activity">
				<Link
					to="/tabs/social/inbox"
					className="flex items-center gap-3 px-4 py-3 text-foreground no-underline hover:bg-muted/60"
				>
					<Inbox className="size-5 text-muted-foreground" />
					<div className="min-w-0 flex-1">
						<div className="font-medium text-foreground text-sm">Inbox</div>
						<div className="text-muted-foreground text-xs">
							{unreadCount > 0 ? `${unreadCount} unread` : "Requests and updates"}
						</div>
					</div>
					<ChevronRight className="size-4 text-muted-foreground" />
				</Link>
				<PlaceholderRow icon={Newspaper} title="Activity" subtitle="What your friends read" />
				<PlaceholderRow icon={Users} title="Buddy reads" subtitle="Read a book together" />
			</Section>

			<Section title="Privacy">
				<Link
					to="/tabs/social/blocked"
					className="flex items-center gap-3 px-4 py-3 text-foreground no-underline hover:bg-muted/60"
				>
					<ShieldOff className="size-5 text-muted-foreground" />
					<span className="flex-1 text-sm">Blocked users</span>
					{data.blocked.length > 0 && (
						<span className="text-muted-foreground text-xs">{data.blocked.length}</span>
					)}
					<ChevronRight className="size-4 text-muted-foreground" />
				</Link>
			</Section>

			<ActionSheet
				open={menu !== null}
				onOpenChange={(open) => !open && setMenu(null)}
				title={menu?.title}
				items={menu?.items ?? []}
			/>
			<ReportSheet target={reportTarget} onClose={() => setReportTarget(null)} />
			<ConfirmDialog
				open={confirm !== null}
				onOpenChange={(open) => !open && setConfirm(null)}
				title={confirm?.title ?? ""}
				description={confirm?.description}
				confirmLabel={confirm?.confirmLabel}
				destructive={confirm?.destructive}
				onConfirm={() => confirm?.run()}
			/>
		</>
	);
}

function PlaceholderRow({
	icon: Icon,
	title,
	subtitle,
}: {
	icon: React.ComponentType<{ className?: string }>;
	title: string;
	subtitle: string;
}) {
	return (
		<div className="flex items-center gap-3 px-4 py-3 opacity-60">
			<Icon className="size-5 text-muted-foreground" />
			<div className="min-w-0 flex-1">
				<div className="font-medium text-foreground text-sm">{title}</div>
				<div className="text-muted-foreground text-xs">{subtitle}</div>
			</div>
		</div>
	);
}

function SocialContent() {
	const router = useRouter();
	const isOnline = useIsOnline();
	const relationships = useRelationships();
	const unread = useUnreadCount();

	// A link opened before sign-in or the handle claim lands here afterwards.
	useEffect(() => {
		void replayPendingLink(router);
	}, [router]);

	if (relationships.isPending) return <Spinner />;
	if (relationships.isError && !relationships.data) {
		return (
			<OfflineNotice onRetry={() => void relationships.refetch()}>
				{isOnline
					? "Couldn't load your friends. Try again."
					: "You're offline. Your friends will show once you're back online."}
			</OfflineNotice>
		);
	}
	return (
		<>
			<StaleNotice
				isOnline={isOnline}
				isError={relationships.isError}
				onRetry={() => void relationships.refetch()}
			/>
			<SocialLists
				data={relationships.data}
				isOffline={!isOnline}
				unreadCount={unread.data?.count ?? 0}
			/>
		</>
	);
}

export default function SocialPage() {
	return (
		<div className="bg-background">
			<TabHeader title="Social" icon={Users} />
			<div className="mx-auto max-w-2xl px-4 pb-10">
				<SocialGate returnTo="/tabs/social">
					<SocialContent />
				</SocialGate>
			</div>
		</div>
	);
}
