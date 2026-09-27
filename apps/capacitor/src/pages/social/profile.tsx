import type { ProfileCover, ProfileStats, ProfileView } from "@lesefluss/core";
import { ratingStars } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { IdentityCard } from "@lesefluss/ui/social-avatar";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Ban, Flag, Lock, MoreHorizontal, Settings, UserMinus, UserRound } from "lucide-react";
import { useState } from "react";
import { ActionSheet, type ActionSheetItem } from "@/components/action-sheet";
import { PageHeader } from "@/components/app-shell/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ReportSheet, type ReportTarget } from "@/components/social/report-sheet";
import { CoverShelf, SocialSection, StatTile } from "@/components/social/social-ui";
import { toast } from "@/components/toast";
import { AuthedFetchError } from "@/services/authed-fetch";
import { getCoverUrl } from "@/services/catalog/client";
import { useIsOnline } from "@/services/social/cache";
import { socialErrorMessage, useBlockUser, useRemoveFriend } from "@/services/social/friends";
import { useProfileView } from "@/services/social/profile-view";
import { formatDuration } from "@/utils/date-utils";
import { OfflineNotice, SocialGate, Spinner } from "./social-gate";

function coverSrc(cover: ProfileCover): string | null {
	if (!cover) return null;
	return cover.kind === "catalog" ? getCoverUrl(cover.catalogId) : cover.url;
}

function statTiles(stats: ProfileStats): { label: string; value: string }[] {
	const tiles = [
		{ label: "Finished this year", value: String(stats.booksFinishedThisYear) },
		{ label: "Words read", value: stats.wordsRead.toLocaleString() },
	];
	if (stats.currentStreakDays !== null) {
		tiles.push({ label: "Day streak", value: String(stats.currentStreakDays) });
	}
	if (stats.longestStreakDays !== null) {
		const n = stats.longestStreakDays;
		tiles.push({ label: "Longest streak", value: `${n} ${n === 1 ? "day" : "days"}` });
	}
	if (stats.readingTimeMs !== null) {
		tiles.push({ label: "Reading time", value: formatDuration(stats.readingTimeMs) });
	}
	if (stats.readingSpeedWpm !== null) {
		tiles.push({ label: "Reading speed", value: `${stats.readingSpeedWpm} wpm` });
	}
	return tiles;
}

function friendsSinceLabel(ms: number | null): string {
	if (ms === null) return "Friends";
	return `Friends since ${new Date(ms).toLocaleDateString(undefined, { month: "short", year: "numeric" })}`;
}

function ProfileContent({ view, isPreview }: { view: ProfileView; isPreview: boolean }) {
	const isOnline = useIsOnline();
	const remove = useRemoveFriend();
	const block = useBlockUser();
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const [confirm, setConfirm] = useState<"remove" | "block" | null>(null);
	const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
	const { identity, relation, friendsSince } = view.header;
	const isSelf = relation === "self" || isPreview;
	const onError = (err: unknown) => toast.error(socialErrorMessage(err));

	const menuItems: ActionSheetItem[] = [
		{
			label: "Remove friend",
			icon: UserMinus,
			disabled: !isOnline,
			onSelect: () => setConfirm("remove"),
		},
		{
			label: "Report",
			icon: Flag,
			onSelect: () =>
				setReportTarget({ type: "profile", userId: identity.userId, name: identity.name }),
		},
		{
			label: "Block",
			icon: Ban,
			destructive: true,
			disabled: !isOnline,
			onSelect: () => setConfirm("block"),
		},
	];

	return (
		<>
			<motion.div
				initial={{ opacity: 0, y: 12 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.4 }}
				className="mt-3 rounded-2xl border border-current/10 bg-card p-5 text-card-foreground"
			>
				<div className="flex items-start justify-between gap-3">
					<IdentityCard
						name={identity.name}
						handle={identity.handle}
						avatarUrl={identity.avatarUrl}
					/>
					{!isSelf && (
						<Button
							variant="ghost"
							size="icon"
							aria-label="More"
							onClick={() => setIsMenuOpen(true)}
						>
							<MoreHorizontal className="size-4" />
						</Button>
					)}
				</div>
				<p className="mt-3 text-muted-foreground text-xs">
					{isPreview
						? "Preview: what a friend sees"
						: isSelf
							? "You"
							: friendsSinceLabel(friendsSince)}
				</p>
				{view.bio !== undefined && view.bio && (
					<p className="mt-2 whitespace-pre-line text-foreground text-sm">{view.bio}</p>
				)}
				{view.friendCount !== undefined && (
					<p className="mt-2 text-muted-foreground text-xs">
						{view.friendCount} {view.friendCount === 1 ? "friend" : "friends"}
					</p>
				)}
				{isSelf && !isPreview && (
					<Button asChild variant="outline" size="sm" className="mt-3">
						<Link to="/tabs/settings/social">
							<Settings /> Edit profile
						</Link>
					</Button>
				)}
			</motion.div>

			{/* The server leaves out bio and sections entirely when the profile is private. */}
			{view.bio === undefined && (
				<div className="mt-4 rounded-xl border border-current/10 bg-card px-4 py-5 text-center">
					<Lock className="mx-auto mb-2 size-5 text-muted-foreground" />
					<p className="m-0 text-muted-foreground text-sm">
						{isPreview
							? "Your profile is private, so friends only see your name, handle and picture."
							: `${identity.name} keeps their profile private.`}
					</p>
					{isPreview && (
						<Button asChild variant="outline" size="sm" className="mt-3">
							<Link to="/tabs/settings/social">Change profile visibility</Link>
						</Button>
					)}
				</div>
			)}

			{view.sections.currentlyReading && (
				<SocialSection title="Currently reading">
					{view.sections.currentlyReading.length === 0 ? (
						<p className="m-0 px-1 text-muted-foreground text-sm">Nothing in progress right now.</p>
					) : (
						<CoverShelf
							items={view.sections.currentlyReading.map((book) => ({
								key: book.key,
								title: book.title,
								author: book.author,
								coverSrc: coverSrc(book.cover),
								percent: book.progressPercent,
								detail: `${book.progressPercent}%`,
							}))}
						/>
					)}
				</SocialSection>
			)}

			{view.sections.finished && (
				<SocialSection title="Finished">
					{view.sections.finished.length === 0 ? (
						<p className="m-0 px-1 text-muted-foreground text-sm">No finished books yet.</p>
					) : (
						<CoverShelf
							items={view.sections.finished.map((book) => ({
								key: book.key,
								title: book.title,
								author: book.author,
								coverSrc: coverSrc(book.cover),
								detail:
									book.rating !== null
										? `★ ${ratingStars(book.rating)}`
										: (book.finishedOn ?? undefined),
							}))}
						/>
					)}
				</SocialSection>
			)}

			{view.sections.stats && (
				<SocialSection title="Reading stats">
					<div className="grid grid-cols-2 gap-2.5">
						{statTiles(view.sections.stats).map((tile) => (
							<StatTile key={tile.label} value={tile.value} label={tile.label} />
						))}
					</div>
				</SocialSection>
			)}

			<ActionSheet
				open={isMenuOpen}
				onOpenChange={setIsMenuOpen}
				title={identity.name}
				items={menuItems}
			/>
			<ReportSheet target={reportTarget} onClose={() => setReportTarget(null)} />
			<ConfirmDialog
				open={confirm !== null}
				onOpenChange={(open) => !open && setConfirm(null)}
				title={confirm === "remove" ? `Remove ${identity.name}?` : `Block ${identity.name}?`}
				description={
					confirm === "remove"
						? "You disappear from each other's friend lists. They are not notified."
						: "Ends the friendship and stops any further contact in both directions. They are not notified. You can unblock later from Blocked users."
				}
				confirmLabel={confirm === "remove" ? "Remove" : "Block"}
				destructive
				onConfirm={() => {
					if (confirm === "remove") remove.mutate(identity.userId, { onError });
					else if (confirm === "block") block.mutate(identity.userId, { onError });
				}}
			/>
		</>
	);
}

function isNotFound(err: unknown): boolean {
	return err instanceof AuthedFetchError && err.status === 404;
}

function ProfileBody({ userId, isPreview }: { userId: string; isPreview: boolean }) {
	const view = useProfileView(userId, { asFriend: isPreview });
	if (view.isPending) return <Spinner />;
	if (view.isError) {
		if (isNotFound(view.error)) {
			return (
				<div className="mt-2 flex flex-col items-center gap-3 rounded-lg border border-border bg-card px-4 py-8 text-center">
					<UserRound className="size-6 text-muted-foreground" />
					<p className="text-muted-foreground text-sm">This profile isn't available.</p>
					<Button asChild variant="outline" size="sm">
						<Link to="/tabs/social">Back to Social</Link>
					</Button>
				</div>
			);
		}
		return (
			<OfflineNotice onRetry={() => void view.refetch()}>
				Can't load this profile right now.
			</OfflineNotice>
		);
	}
	return <ProfileContent view={view.data} isPreview={isPreview} />;
}

export default function ProfilePage({ userId, isPreview }: { userId: string; isPreview: boolean }) {
	return (
		<div className="bg-background">
			<PageHeader
				title={isPreview ? "Profile preview" : "Profile"}
				icon={UserRound}
				backTo="/tabs/social"
			/>
			<div className="mx-auto max-w-2xl px-4 pb-10">
				<SocialGate returnTo={`/tabs/social/profile/${encodeURIComponent(userId)}`}>
					<ProfileBody userId={userId} isPreview={isPreview} />
				</SocialGate>
			</div>
		</div>
	);
}
