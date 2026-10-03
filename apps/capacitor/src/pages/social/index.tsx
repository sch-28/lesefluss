import type { OwnSocialProfile, SocialIdentity, SocialRelationships } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { SocialAvatar } from "@lesefluss/ui/social-avatar";
import { Link, useRouter } from "@tanstack/react-router";
import { Ban, Flag, Inbox, MoreHorizontal, ShieldOff, UserCog, Users } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { ActionSheet, type ActionSheetItem } from "@/components/action-sheet";
import { TabHeader } from "@/components/app-shell/tab-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ActivityFeed } from "@/components/social/activity-feed";
import { BuddyReadCard } from "@/components/social/buddy-read-card";
import { ReportSheet, type ReportTarget } from "@/components/social/report-sheet";
import { ListCard, SocialSection } from "@/components/social/social-ui";
import { StartBuddyReadPicker } from "@/components/social/start-buddy-read-picker";
import { toast } from "@/components/toast";
import { useSyncContext } from "@/contexts/sync-context";
import { replayPendingLink } from "@/services/deep-links/use-deep-links";
import { useBuddyReads } from "@/services/social/buddy-reads";
import { useIsOnline } from "@/services/social/cache";
import {
	socialErrorMessage,
	useCancelRequest,
	useRelationships,
	useRespondToRequest,
} from "@/services/social/friends";
import { useUnreadCount } from "@/services/social/inbox";
import { useOwnSocialProfile } from "@/services/social/profile";
import { FirstRunHero } from "./first-run-hero";
import { FriendsRow } from "./friends-row";
import { MeHero } from "./me-hero";
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

const PREVIEW_READS = 3;

function BuddyReadsPreview() {
	const reads = useBuddyReads();
	const [isPickerOpen, setIsPickerOpen] = useState(false);
	const active = (reads.data ?? []).filter((r) => r.status === "in_progress");
	if (reads.isPending) return null;
	if (reads.isError && !reads.data) {
		return (
			<SocialSection title="Buddy reads">
				<p className="m-0 px-1 text-muted-foreground text-sm">
					Couldn't load your buddy reads. They show again once you're back online.
				</p>
			</SocialSection>
		);
	}
	return (
		<SocialSection
			title="Buddy reads"
			action={
				<div className="flex items-center gap-4">
					{active.length > 0 && (
						<button
							type="button"
							onClick={() => setIsPickerOpen(true)}
							className="text-primary text-xs"
						>
							Start one
						</button>
					)}
					{reads.data && reads.data.length > 0 && (
						<Link to="/tabs/social/buddy-reads" className="no-underline">
							<span className="text-primary text-xs">See all</span>
						</Link>
					)}
				</div>
			}
		>
			{active.length === 0 ? (
				<div className="rounded-2xl border border-border border-dashed px-4 py-5 text-center">
					<p className="m-0 text-muted-foreground text-sm">
						Read a book together with friends and see where everyone is.
					</p>
					<Button size="sm" className="mt-3" onClick={() => setIsPickerOpen(true)}>
						Start a buddy read
					</Button>
				</div>
			) : (
				<div className="flex flex-col gap-2.5">
					{active.slice(0, PREVIEW_READS).map((read, i) => (
						<BuddyReadCard key={read.id} read={read} index={i} isFeatured={i === 0} />
					))}
				</div>
			)}
			<StartBuddyReadPicker isOpen={isPickerOpen} onClose={() => setIsPickerOpen(false)} />
		</SocialSection>
	);
}

function RequestCard({
	person,
	isBusy,
	onAccept,
	onDecline,
	menuButton,
}: {
	person: SocialIdentity;
	isBusy: boolean;
	onAccept: () => void;
	onDecline: () => void;
	menuButton: React.ReactNode;
}) {
	return (
		<div className="rounded-2xl border border-primary/35 bg-primary/5 p-3.5">
			<div className="flex items-center gap-3">
				<SocialAvatar name={person.name} avatarUrl={person.avatarUrl} size="md" />
				<div className="min-w-0 flex-1">
					<div className="text-foreground text-sm">
						<span className="font-semibold">{person.name}</span> wants to be friends
					</div>
					<div className="mt-0.5 truncate text-muted-foreground text-xs">@{person.handle}</div>
				</div>
				{menuButton}
			</div>
			<div className="mt-3 grid grid-cols-2 gap-2">
				<Button disabled={isBusy} onClick={onAccept}>
					Accept
				</Button>
				<Button variant="outline" disabled={isBusy} onClick={onDecline}>
					Decline
				</Button>
			</div>
		</div>
	);
}

function SocialLists({
	data,
	me,
	isOffline,
}: {
	data: SocialRelationships;
	me: OwnSocialProfile | undefined;
	isOffline: boolean;
}) {
	const respond = useRespondToRequest();
	const cancel = useCancelRequest();
	const buddyReads = useBuddyReads();
	const [menu, setMenu] = useState<{ title: string; items: ActionSheetItem[] } | null>(null);
	const [confirm, setConfirm] = useState<Confirm | null>(null);
	const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
	const isPending = respond.isPending || cancel.isPending;
	const isBusy = isOffline || isPending;
	const onError = (err: unknown) => toast.error(socialErrorMessage(err));
	const hasFriends = data.friends.length > 0;
	const hasBuddyReads = (buddyReads.data?.length ?? 0) > 0;

	const incomingMenu = (person: SocialIdentity, requestId: string) =>
		setMenu({
			title: person.name,
			items: [
				{
					label: "Report",
					icon: Flag,
					onSelect: () =>
						setReportTarget({ type: "profile", userId: person.userId, name: person.name }),
				},
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

	return (
		<>
			{data.incoming.length > 0 && (
				<div className="mt-4 flex flex-col gap-2.5">
					{data.incoming.map((r) => (
						<RequestCard
							key={r.requestId}
							person={r}
							isBusy={isBusy}
							onAccept={() =>
								respond.mutate({ requestId: r.requestId, action: "accept" }, { onError })
							}
							onDecline={() =>
								respond.mutate({ requestId: r.requestId, action: "decline" }, { onError })
							}
							menuButton={
								// Stays usable offline: Report must be reachable so the failed send can say so.
								<Button
									variant="ghost"
									size="icon"
									onClick={() => incomingMenu(r, r.requestId)}
									disabled={isPending}
									aria-label="More"
								>
									<MoreHorizontal className="size-4" />
								</Button>
							}
						/>
					))}
				</div>
			)}

			{hasFriends ? (
				<>
					{me?.handle && <MeHero me={me} friendCount={data.friends.length} />}
					<BuddyReadsPreview />
					<FriendsRow friends={data.friends} />
					{data.outgoing.length > 0 && (
						<SocialSection title="Sent requests">
							<ListCard>
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
							</ListCard>
						</SocialSection>
					)}
					<ActivityFeed />
				</>
			) : (
				<>
					<FirstRunHero
						me={me}
						outgoing={data.outgoing}
						isBusy={isBusy}
						onCancel={(requestId) => cancel.mutate(requestId, { onError })}
					/>
					{/* Buddy reads and own feed events outlive the friendships they started from. */}
					{hasBuddyReads && <BuddyReadsPreview />}
					<ActivityFeed isHiddenWhenEmpty />
				</>
			)}

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

function SocialContent() {
	const router = useRouter();
	const isOnline = useIsOnline();
	const relationships = useRelationships();
	const me = useOwnSocialProfile();

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
			<SocialLists data={relationships.data} me={me.data} isOffline={!isOnline} />
		</>
	);
}

function InboxButton() {
	const unread = useUnreadCount();
	const count = unread.data?.count ?? 0;
	return (
		<Button asChild variant="ghost" size="icon" className="relative">
			<Link to="/tabs/social/inbox" aria-label={count > 0 ? `Inbox, ${count} unread` : "Inbox"}>
				<Inbox className="size-5" />
				{count > 0 && (
					<span className="absolute top-1 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-bold text-[10px] text-primary-foreground tabular-nums ring-2 ring-background">
						{count > 99 ? "99+" : count}
					</span>
				)}
			</Link>
		</Button>
	);
}

function SocialMenu() {
	const router = useRouter();
	const [isOpen, setIsOpen] = useState(false);
	return (
		<>
			<InboxButton />
			<Button variant="ghost" size="icon" aria-label="More" onClick={() => setIsOpen(true)}>
				<MoreHorizontal className="size-5" />
			</Button>
			<ActionSheet
				open={isOpen}
				onOpenChange={setIsOpen}
				items={[
					{
						label: "Profile settings",
						icon: UserCog,
						onSelect: () => void router.navigate({ to: "/tabs/settings/social" }),
					},
					{
						label: "Blocked users",
						icon: ShieldOff,
						onSelect: () => void router.navigate({ to: "/tabs/social/blocked" }),
					},
				]}
			/>
		</>
	);
}

export default function SocialPage() {
	const { isLoggedIn } = useSyncContext();
	return (
		<div className="bg-background">
			<TabHeader title="Social" icon={Users} right={isLoggedIn ? <SocialMenu /> : undefined} />
			<div className="mx-auto max-w-2xl px-4 pb-10">
				<SocialGate returnTo="/tabs/social">
					<SocialContent />
				</SocialGate>
			</div>
		</div>
	);
}
