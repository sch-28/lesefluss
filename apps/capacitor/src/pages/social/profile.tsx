import type {
	ProfileBook,
	ProfileCover,
	ProfileFinishedBook,
	ProfileStats,
	ProfileView,
} from "@lesefluss/core";
import { ratingStars } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { IdentityCard } from "@lesefluss/ui/social-avatar";
import { Link } from "@tanstack/react-router";
import { Ban, Flag, MoreHorizontal, Settings, UserMinus, UserRound } from "lucide-react";
import { useState } from "react";
import { ActionSheet, type ActionSheetItem } from "@/components/action-sheet";
import { PageHeader } from "@/components/app-shell/page-header";
import { EmptyRow, Section } from "@/components/app-shell/section";
import { ConfirmDialog } from "@/components/confirm-dialog";
import CoverImage from "@/components/cover-image";
import { ReportSheet, type ReportTarget } from "@/components/social/report-sheet";
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

function BookRow({
	book,
	trailing,
}: {
	book: ProfileBook | ProfileFinishedBook;
	trailing: string;
}) {
	return (
		<div className="flex items-center gap-3 px-4 py-3">
			<div className="h-14 w-10 shrink-0 overflow-hidden rounded-sm border border-border bg-muted">
				<CoverImage src={coverSrc(book.cover)} alt="" className="h-full w-full" />
			</div>
			<div className="min-w-0 flex-1">
				<div className="truncate font-medium text-foreground text-sm">{book.title}</div>
				{book.author && <div className="truncate text-muted-foreground text-xs">{book.author}</div>}
			</div>
			<span className="shrink-0 text-muted-foreground text-xs">{trailing}</span>
		</div>
	);
}

function StatsGrid({ stats }: { stats: ProfileStats }) {
	const cells: { label: string; value: string }[] = [
		{ label: "Finished this year", value: String(stats.booksFinishedThisYear) },
		{ label: "Words read", value: stats.wordsRead.toLocaleString() },
	];
	if (stats.readingTimeMs !== null) {
		cells.push({ label: "Reading time", value: formatDuration(stats.readingTimeMs) });
	}
	if (stats.readingSpeedWpm !== null) {
		cells.push({ label: "Reading speed", value: `${stats.readingSpeedWpm} wpm` });
	}
	return (
		<div className="grid grid-cols-2 gap-px bg-border">
			{cells.map((cell) => (
				<div key={cell.label} className="bg-card px-4 py-3">
					<div className="font-semibold text-foreground text-lg">{cell.value}</div>
					<div className="text-muted-foreground text-xs">{cell.label}</div>
				</div>
			))}
		</div>
	);
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
			<div className="mt-2 rounded-lg border border-border bg-card p-4">
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
							<Settings /> Profile settings
						</Link>
					</Button>
				)}
			</div>

			{view.sections.currentlyReading && (
				<Section title="Currently reading">
					{view.sections.currentlyReading.length === 0 ? (
						<EmptyRow>Nothing in progress right now.</EmptyRow>
					) : (
						view.sections.currentlyReading.map((book) => (
							<BookRow key={book.key} book={book} trailing={`${book.progressPercent}%`} />
						))
					)}
				</Section>
			)}

			{view.sections.finished && (
				<Section title="Finished">
					{view.sections.finished.length === 0 ? (
						<EmptyRow>No finished books yet.</EmptyRow>
					) : (
						view.sections.finished.map((book) => (
							<BookRow
								key={book.key}
								book={book}
								trailing={
									book.rating !== null ? `★ ${ratingStars(book.rating)}` : (book.finishedOn ?? "")
								}
							/>
						))
					)}
				</Section>
			)}

			{view.sections.stats && (
				<Section title="Reading stats">
					<StatsGrid stats={view.sections.stats} />
				</Section>
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
			<PageHeader title={isPreview ? "Profile preview" : "Profile"} icon={UserRound} />
			<div className="mx-auto max-w-2xl px-4 pb-10">
				<SocialGate returnTo={`/tabs/social/profile/${encodeURIComponent(userId)}`}>
					<ProfileBody userId={userId} isPreview={isPreview} />
				</SocialGate>
			</div>
		</div>
	);
}
