import type { BuddyReadDetail, BuddyReadParticipant } from "@lesefluss/core";
import { isOnPace, readingProgress } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { SocialAvatar } from "@lesefluss/ui/social-avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@lesefluss/ui/tabs";
import { cn } from "@lesefluss/ui/utils";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
	Ban,
	BookOpen,
	CalendarClock,
	Crown,
	Flag,
	LogOut,
	MoreHorizontal,
	UserMinus,
	UserPlus,
	Users,
} from "lucide-react";
import { useState } from "react";
import { ActionSheet, type ActionSheetItem } from "@/components/action-sheet";
import { PageHeader } from "@/components/app-shell/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import CoverImage from "@/components/cover-image";
import { FriendPickerSheet } from "@/components/social/friend-picker-sheet";
import { ReportSheet, type ReportTarget } from "@/components/social/report-sheet";
import {
	FinishedLabel,
	ListCard,
	ProgressBar,
	SocialSection,
	useLocalCover,
} from "@/components/social/social-ui";
import { toast } from "@/components/toast";
import { queryHooks } from "@/services/db/hooks";
import { socialKeys } from "@/services/db/hooks/query-keys";
import { parseChapters } from "@/services/db/queries/books";
import {
	buddyReadFailureMessage,
	paceText,
	useBuddyRead,
	useCancelBuddyReadInvite,
	useInviteToBuddyRead,
	useLeaveBuddyRead,
	useRemoveBuddyReadMember,
	useSendFriendRequest,
	useSetBuddyReadTargetDate,
} from "@/services/social/buddy-reads";
import { useIsOnline } from "@/services/social/cache";
import { useBlockUser } from "@/services/social/friends";
import { currentChapterIndex } from "@/utils/chapters";
import { formatAgo, formatRelative } from "@/utils/date-utils";
import { DiscussionPanel } from "./buddy-read-discussion";
import { OfflineNotice, SocialGate, Spinner, StaleNotice } from "./social-gate";

type Confirm = {
	title: string;
	description: string;
	confirmLabel: string;
	run: () => void;
};

const BUDDY_READ_MAX = 8;

function relativeTo(delta: number): string {
	if (delta === 0) return "same place as you";
	return delta > 0 ? "ahead of you" : "behind you";
}

function toDateInput(ms: number | null): string {
	if (ms === null) return "";
	const d = new Date(ms);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** End of the picked local day, so "finish by Friday" includes Friday. */
function fromDateInput(value: string): number | null {
	if (!value) return null;
	const [y, m, d] = value.split("-").map(Number);
	if (!y || !m || !d) return null;
	return new Date(y, m - 1, d, 23, 59, 59).getTime();
}

function paceLine(detail: BuddyReadDetail, myPercent: number | null): string | null {
	if (detail.targetDate === null) return null;
	const due = new Date(detail.targetDate).toLocaleDateString();
	const onPace = isOnPace({
		percent: myPercent,
		createdAt: detail.createdAt,
		targetDate: detail.targetDate,
		now: Date.now(),
	});
	if (onPace === null) return `Finish by ${due}`;
	return `Finish by ${due} · ${paceText(onPace)}`;
}

/** Finished readers first, then by progress. */
function progressRank(p: BuddyReadParticipant): number {
	return p.finishedAt !== null ? 101 : (p.percent ?? -1);
}

function ParticipantRow({
	participant,
	detail,
	chapterTitle,
	myPosition,
	onMenu,
	isOffline,
}: {
	participant: BuddyReadParticipant;
	detail: BuddyReadDetail;
	chapterTitle: string | null;
	myPosition: number | null;
	onMenu: () => void;
	isOffline: boolean;
}) {
	const p = participant;
	const facts = [
		p.finishedAt !== null ? null : p.percent !== null ? `${p.percent}%` : "Progress unknown",
		chapterTitle,
		!p.isSelf && !detail.approximate && myPosition !== null
			? relativeTo(p.wordPosition - myPosition)
			: null,
		!p.isSelf && p.lastActiveAt !== null ? `active ${formatAgo(p.lastActiveAt)}` : null,
	].filter(Boolean);
	const identity = (
		<>
			<SocialAvatar name={p.identity.name} avatarUrl={p.identity.avatarUrl} size="md" />
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-1.5 truncate font-medium text-foreground text-sm">
					<span className="truncate">{p.isSelf ? "You" : p.identity.name}</span>
					{p.isHost && <Crown className="size-3.5 shrink-0 text-amber-500" aria-label="Host" />}
				</div>
				<div className="truncate text-muted-foreground text-xs">
					{p.finishedAt !== null && <FinishedLabel className="mr-1 align-middle" />}
					{[`@${p.identity.handle}`, ...facts].join(" · ")}
				</div>
			</div>
		</>
	);
	return (
		<div className={cn("px-4 py-3", p.isSelf && "bg-primary/5")}>
			<div className="flex items-center gap-3">
				{p.isFriend && !p.isSelf ? (
					<Link
						to="/tabs/social/profile/$userId"
						params={{ userId: p.identity.userId }}
						className="flex min-w-0 flex-1 items-center gap-3 text-foreground no-underline"
					>
						{identity}
					</Link>
				) : (
					<div className="flex min-w-0 flex-1 items-center gap-3">{identity}</div>
				)}
				{!p.isSelf && (
					<Button
						variant="ghost"
						size="icon"
						aria-label={`Actions for ${p.identity.name}`}
						disabled={isOffline}
						onClick={onMenu}
					>
						<MoreHorizontal className="size-4" />
					</Button>
				)}
			</div>
			<ProgressBar percent={p.percent} finished={p.finishedAt !== null} className="mt-2" />
		</div>
	);
}

function BuddyReadContent({ id, tab }: { id: string; tab: BuddyReadTab }) {
	const router = useRouter();
	const client = useQueryClient();
	const isOnline = useIsOnline();
	const isOffline = !isOnline;
	const query = useBuddyRead(id);
	const detail = query.data;
	const { data: myBook } = queryHooks.useBook(detail?.myBookId ?? "");
	const cover = useLocalCover(detail?.myBookId ?? "");
	const showTab = (next: BuddyReadTab) =>
		void router.navigate({
			to: "/tabs/social/buddy-read/$id",
			params: { id },
			search: next === "discussion" ? { tab: "discussion" } : {},
			replace: true,
		});
	const { data: myContent } = queryHooks.useBookContent(detail?.myBookId ?? "");
	const chapters = parseChapters(myContent?.chapters ?? null);

	const leave = useLeaveBuddyRead();
	const remove = useRemoveBuddyReadMember();
	const invite = useInviteToBuddyRead();
	const cancelInvite = useCancelBuddyReadInvite(id);
	const setTarget = useSetBuddyReadTargetDate();
	const addFriend = useSendFriendRequest(id);
	const block = useBlockUser();
	const [menu, setMenu] = useState<{ title: string; items: ActionSheetItem[] } | null>(null);
	const [confirm, setConfirm] = useState<Confirm | null>(null);
	const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
	const [isInviteOpen, setIsInviteOpen] = useState(false);
	const [inviteError, setInviteError] = useState<string | null>(null);
	const onError = (err: unknown) => toast.error(buddyReadFailureMessage(err));

	if (query.isPending) return <Spinner />;
	if (!detail) {
		return (
			<OfflineNotice onRetry={() => void query.refetch()}>
				{isOnline
					? "Couldn't load this buddy read. It may have ended, or you're no longer part of it."
					: "You're offline. This buddy read will show once you're back online."}
			</OfflineNotice>
		);
	}

	// Our own position is fresher on this device than whatever was last pushed.
	const myPosition = myBook?.wordPosition ?? null;
	const myPercent =
		myBook && myBook.wordCount > 0
			? readingProgress({ wordCount: myBook.wordCount, wordPosition: myBook.wordPosition })
			: null;
	const participants = detail.participants
		.map((p) =>
			p.isSelf && myBook
				? { ...p, wordPosition: myBook.wordPosition, percent: myPercent ?? p.percent }
				: p,
		)
		.sort((a, b) => progressRank(b) - progressRank(a));
	const chapterOf = (p: BuddyReadParticipant) =>
		chapters.length > 1
			? (chapters[currentChapterIndex(chapters, p.wordPosition)]?.title ?? null)
			: null;
	const isActive = detail.status === "in_progress" && !detail.originUnavailable;
	const seatsLeft = BUDDY_READ_MAX - detail.memberCount - detail.invites.length;
	const pace = isActive ? paceLine(detail, myPercent) : null;

	const participantMenu = (p: BuddyReadParticipant) => {
		const items: ActionSheetItem[] = [];
		if (p.isFriend) {
			items.push({
				label: "Open profile",
				icon: Users,
				onSelect: () =>
					router.navigate({
						to: "/tabs/social/profile/$userId",
						params: { userId: p.identity.userId },
					}),
			});
		} else if (p.relationship === "pending_outgoing") {
			items.push({
				label: "Friend request sent",
				icon: UserPlus,
				disabled: true,
				onSelect: () => {},
			});
		} else {
			items.push({
				label:
					p.relationship === "pending_incoming" ? "Accept friend request" : "Send friend request",
				icon: UserPlus,
				onSelect: () =>
					addFriend.mutate(p.identity.userId, {
						onSuccess: ({ state }) =>
							toast.success(
								state === "friends"
									? `You and ${p.identity.name} are friends now.`
									: `Friend request sent to ${p.identity.name}.`,
							),
						onError,
					}),
			});
		}
		if (detail.isHost && isActive) {
			items.push({
				label: "Remove from buddy read",
				icon: UserMinus,
				onSelect: () =>
					setConfirm({
						title: `Remove ${p.identity.name}?`,
						description:
							"They stop seeing this buddy read and keep the book. They can come back only if you invite them again.",
						confirmLabel: "Remove",
						run: () => remove.mutate({ buddyReadId: id, userId: p.identity.userId }, { onError }),
					}),
			});
		}
		items.push({
			label: "Report",
			icon: Flag,
			onSelect: () =>
				setReportTarget({ type: "profile", userId: p.identity.userId, name: p.identity.name }),
		});
		items.push({
			label: "Block",
			icon: Ban,
			destructive: true,
			onSelect: () =>
				setConfirm({
					title: `Block ${p.identity.name}?`,
					description:
						"You stop seeing each other here and anywhere else, and any friendship ends. They are not notified.",
					confirmLabel: "Block",
					run: () =>
						block.mutate(p.identity.userId, {
							onSuccess: () =>
								void client.invalidateQueries({ queryKey: socialKeys.buddyRead(id) }),
							onError,
						}),
				}),
		});
		setMenu({ title: p.identity.name, items });
	};

	return (
		<>
			<StaleNotice
				isOnline={isOnline}
				isError={query.isError}
				onRetry={() => void query.refetch()}
			/>
			<motion.section
				initial={{ opacity: 0, y: 12 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.4 }}
				className="mt-3 rounded-2xl border border-current/10 bg-card p-4 text-card-foreground"
			>
				<div className="flex gap-4">
					<div className="relative aspect-[2/3] w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
						<CoverImage src={cover} alt={detail.title} />
					</div>
					<div className="flex min-w-0 flex-1 flex-col">
						<h2 className="m-0 line-clamp-2 font-semibold text-foreground text-lg leading-snug">
							{detail.title}
						</h2>
						{detail.author && (
							<p className="m-0 mt-0.5 truncate text-muted-foreground text-sm">{detail.author}</p>
						)}
						<p className="mt-2 mb-0 text-muted-foreground text-xs">
							{detail.status === "finished"
								? "Everyone reached the end."
								: detail.host
									? `Hosted by ${detail.host.name}`
									: "In progress"}
							{" · "}
							{detail.memberCount === 1 ? "1 reader" : `${detail.memberCount} readers`}
						</p>
						{pace && <p className="mt-1 mb-0 text-foreground text-xs">{pace}</p>}
					</div>
				</div>
				{detail.originUnavailable && (
					<p className="mt-3 mb-0 rounded-md bg-amber-500/10 px-3 py-2 text-amber-700 text-sm dark:text-amber-400">
						This book is no longer available. Progress is no longer shown.
					</p>
				)}
				{detail.approximate && (
					<p className="mt-3 mb-0 text-muted-foreground text-xs">
						Some copies were counted differently, so positions are approximate.
					</p>
				)}
				{!detail.originUnavailable && (
					<div className="mt-4 flex flex-wrap gap-2">
						{myBook && (
							<Button asChild size="sm">
								<Link to="/tabs/reader/$id" params={{ id: myBook.id }}>
									<BookOpen className="size-4" />
									Continue reading
								</Link>
							</Button>
						)}
						{detail.isHost && isActive && (
							<Button
								size="sm"
								variant="outline"
								disabled={isOffline || seatsLeft <= 0}
								onClick={() => {
									setInviteError(null);
									setIsInviteOpen(true);
								}}
							>
								<UserPlus className="size-4" />
								{seatsLeft > 0 ? "Invite" : "Full"}
							</Button>
						)}
					</div>
				)}
			</motion.section>

			<Tabs
				value={detail.originUnavailable ? "overview" : tab}
				onValueChange={(next) => showTab(next as BuddyReadTab)}
				className="mt-4"
			>
				<TabsList className="w-full">
					<TabsTrigger value="overview" className="flex-1">
						Overview
					</TabsTrigger>
					<TabsTrigger value="discussion" className="flex-1" disabled={detail.originUnavailable}>
						Discussion
					</TabsTrigger>
				</TabsList>
				<TabsContent value="discussion">
					{!detail.originUnavailable && <DiscussionPanel id={id} />}
				</TabsContent>
				<TabsContent value="overview">
					{!detail.originUnavailable && (
						<SocialSection title="Readers">
							<ListCard>
								{participants.map((p) => (
									<ParticipantRow
										key={p.identity.userId}
										participant={p}
										detail={detail}
										chapterTitle={chapterOf(p)}
										myPosition={myPosition}
										onMenu={() => participantMenu(p)}
										isOffline={isOffline}
									/>
								))}
							</ListCard>
						</SocialSection>
					)}

					{detail.isHost && isActive && detail.invites.length > 0 && (
						<SocialSection title="Invited">
							<ListCard>
								{detail.invites.map((inv) => (
									<div key={inv.inviteId} className="flex items-center gap-3 px-4 py-3">
										<SocialAvatar
											name={inv.invitee.name}
											avatarUrl={inv.invitee.avatarUrl}
											size="md"
										/>
										<div className="min-w-0 flex-1">
											<div className="truncate font-medium text-foreground text-sm">
												{inv.invitee.name}
											</div>
											<div className="truncate text-muted-foreground text-xs">
												@{inv.invitee.handle} · invited {formatRelative(inv.createdAt)}
											</div>
										</div>
										<Button
											size="sm"
											variant="ghost"
											disabled={isOffline || cancelInvite.isPending}
											onClick={() => cancelInvite.mutate(inv.inviteId, { onError })}
										>
											Cancel
										</Button>
									</div>
								))}
							</ListCard>
						</SocialSection>
					)}

					{detail.isHost && isActive && (
						<SocialSection title="Target date">
							<ListCard>
								<div className="flex items-center gap-3 px-4 py-3">
									<CalendarClock className="size-5 text-muted-foreground" />
									<input
										type="date"
										aria-label="Finish by"
										className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-foreground text-sm"
										value={toDateInput(detail.targetDate)}
										min={toDateInput(Date.now())}
										disabled={isOffline || setTarget.isPending}
										onChange={(e) =>
											setTarget.mutate(
												{ buddyReadId: id, targetDate: fromDateInput(e.target.value) },
												{ onError },
											)
										}
									/>
									{detail.targetDate !== null && (
										<Button
											size="sm"
											variant="ghost"
											disabled={isOffline || setTarget.isPending}
											onClick={() =>
												setTarget.mutate({ buddyReadId: id, targetDate: null }, { onError })
											}
										>
											Clear
										</Button>
									)}
								</div>
							</ListCard>
						</SocialSection>
					)}

					<Button
						variant="outline"
						className="mt-6 w-full"
						disabled={isOffline || leave.isPending}
						onClick={() =>
							setConfirm({
								title: "Leave this buddy read?",
								description: detail.isHost
									? "The book stays in your library. Someone else becomes the host, and the others stop seeing your progress."
									: "The book stays in your library. The others stop seeing your progress.",
								confirmLabel: "Leave",
								run: () =>
									leave.mutate(id, {
										onSuccess: () => router.navigate({ to: "/tabs/social/buddy-reads" }),
										onError,
									}),
							})
						}
					>
						<LogOut className="size-4" />
						Leave buddy read
					</Button>
				</TabsContent>
			</Tabs>

			<FriendPickerSheet
				isOpen={isInviteOpen}
				onClose={() => setIsInviteOpen(false)}
				title={`Invite to "${detail.title}"`}
				intro="Friends who join see everyone's progress on this book, and everyone sees theirs."
				excludeIds={[
					...detail.participants.map((p) => p.identity.userId),
					...detail.invites.map((i) => i.invitee.userId),
				]}
				maxSelected={Math.max(0, seatsLeft)}
				submitLabel="Invite"
				pendingLabel="Inviting…"
				isPending={invite.isPending}
				error={inviteError}
				onSubmit={(inviteeIds) =>
					invite.mutate(
						{ buddyReadId: id, inviteeIds },
						{
							onSuccess: () => {
								toast.success("Invites sent.");
								setIsInviteOpen(false);
							},
							onError: (err) => setInviteError(buddyReadFailureMessage(err)),
						},
					)
				}
			/>
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
				destructive
				onConfirm={() => confirm?.run()}
			/>
		</>
	);
}

export type BuddyReadTab = "overview" | "discussion";

export default function BuddyReadPage({ id, tab }: { id: string; tab: BuddyReadTab }) {
	return (
		<div className="bg-background">
			<PageHeader title="Buddy read" icon={Users} backTo="/tabs/social/buddy-reads" />
			<div className="mx-auto max-w-2xl px-4 pb-10">
				<SocialGate returnTo={`/tabs/social/buddy-read/${id}`}>
					<BuddyReadContent id={id} tab={tab} />
				</SocialGate>
			</div>
		</div>
	);
}
