import type { OwnSocialProfile, SocialIdentity, SocialRelationships } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { SocialAvatar } from "@lesefluss/ui/social-avatar";
import { Link, useRouter } from "@tanstack/react-router";
import {
	Ban,
	ChevronRight,
	Flag,
	Inbox,
	Link2,
	MoreHorizontal,
	ShieldOff,
	UserCog,
	UserMinus,
	Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { ActionSheet, type ActionSheetItem } from "@/components/action-sheet";
import { TabHeader } from "@/components/app-shell/tab-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
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
	useBlockUser,
	useCancelRequest,
	useRelationships,
	useRemoveFriend,
	useRespondToRequest,
} from "@/services/social/friends";
import { useUnreadCount } from "@/services/social/inbox";
import { useOwnSocialProfile } from "@/services/social/profile";
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

function MeCard({ me }: { me: OwnSocialProfile }) {
	return (
		<Link
			to="/tabs/social/profile/$userId"
			params={{ userId: me.userId }}
			className="mt-4 flex items-center gap-3 rounded-2xl border border-current/10 bg-card p-4 text-card-foreground no-underline"
		>
			<SocialAvatar name={me.name} avatarUrl={me.avatarUrl} size="md" />
			<div className="min-w-0 flex-1">
				<div className="truncate font-semibold text-base">{me.name}</div>
				<div className="truncate text-muted-foreground text-xs">@{me.handle} · Your profile</div>
			</div>
			<ChevronRight className="size-4 text-muted-foreground" />
		</Link>
	);
}

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
				<div className="rounded-xl border border-current/10 bg-card px-4 py-5 text-center">
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
						<BuddyReadCard key={read.id} read={read} index={i} />
					))}
				</div>
			)}
			<StartBuddyReadPicker isOpen={isPickerOpen} onClose={() => setIsPickerOpen(false)} />
		</SocialSection>
	);
}

function SocialLists({
	data,
	me,
	isOffline,
	unreadCount,
}: {
	data: SocialRelationships;
	me: OwnSocialProfile | undefined;
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
			{me?.handle && <MeCard me={me} />}

			{data.incoming.length > 0 && (
				<SocialSection title="Requests">
					<ListCard>
						{data.incoming.map((r) => (
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
						))}
					</ListCard>
				</SocialSection>
			)}

			<BuddyReadsPreview />

			<SocialSection
				title="Friends"
				action={
					<Link to="/tabs/social/invite-link" className="no-underline">
						<span className="flex items-center gap-1 text-primary text-xs">
							<Link2 className="size-3.5" />
							Add friend
						</span>
					</Link>
				}
			>
				<ListCard>
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
				</ListCard>
			</SocialSection>

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

			<SocialSection>
				<ListCard>
					<Link
						to="/tabs/social/inbox"
						className="flex items-center gap-3 px-4 py-3 text-foreground no-underline hover:bg-muted/60"
					>
						<Inbox className="size-5 text-muted-foreground" />
						<div className="min-w-0 flex-1">
							<div className="font-medium text-foreground text-sm">Inbox</div>
							<div className="text-muted-foreground text-xs">Updates and invites</div>
						</div>
						{unreadCount > 0 && (
							<span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 font-semibold text-[11px] text-primary-foreground tabular-nums">
								{unreadCount > 99 ? "99+" : unreadCount}
								<span className="sr-only"> unread</span>
							</span>
						)}
						<ChevronRight className="size-4 text-muted-foreground" />
					</Link>
				</ListCard>
			</SocialSection>

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
	const unread = useUnreadCount();
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
			<SocialLists
				data={relationships.data}
				me={me.data}
				isOffline={!isOnline}
				unreadCount={unread.data?.count ?? 0}
			/>
		</>
	);
}

function SocialMenu() {
	const router = useRouter();
	const [isOpen, setIsOpen] = useState(false);
	return (
		<>
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
