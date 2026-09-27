import type { BuddyReadSummary } from "@lesefluss/core";
import { isOnPace, readingProgress } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@lesefluss/ui/drawer";
import { SocialAvatar } from "@lesefluss/ui/social-avatar";
import { Link, useRouter } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { useState } from "react";
import { FriendPickerSheet } from "@/components/social/friend-picker-sheet";
import { toast } from "@/components/toast";
import type { Book } from "@/services/db/schema";
import {
	buddyReadErrorReason,
	buddyReadFailureMessage,
	useBuddyRead,
	useBuddyReads,
	useCreateBuddyRead,
} from "@/services/social/buddy-reads";
import { SignedOutSocial } from "../social/signed-out";

/** The buddy read this book belongs to: the running one, else the latest finished one. */
export function useBookBuddyRead(
	book: Pick<Book, "originKey">,
	enabled: boolean,
): BuddyReadSummary | null {
	const reads = useBuddyReads(enabled && book.originKey !== null);
	const matching = (reads.data ?? []).filter((r) => r.originKey === book.originKey);
	return matching.find((r) => r.status === "in_progress") ?? matching[0] ?? null;
}

/** Everyone's progress on this book at a glance, linking to the full buddy read. */
export function BookBuddyRead({
	read,
	book,
}: {
	read: BuddyReadSummary;
	book: Pick<Book, "wordCount" | "wordPosition">;
}) {
	const detail = useBuddyRead(read.id);
	const myPercent =
		book.wordCount > 0
			? readingProgress({ wordCount: book.wordCount, wordPosition: book.wordPosition })
			: null;
	const onPace =
		read.status === "in_progress"
			? isOnPace({
					percent: myPercent,
					createdAt: read.createdAt,
					targetDate: read.targetDate,
					now: Date.now(),
				})
			: null;
	const others = (detail.data?.participants ?? []).filter((p) => !p.isSelf);
	return (
		<section className="rounded-lg border border-border bg-card p-4 text-card-foreground">
			<div className="mb-2 flex items-center justify-between gap-3">
				<h2 className="m-0 font-semibold text-base">
					{read.status === "finished" ? "Buddy read · finished" : "Buddy read"}
				</h2>
				<Button asChild size="sm" variant="ghost">
					<Link to="/tabs/social/buddy-read/$id" params={{ id: read.id }}>
						Open
					</Link>
				</Button>
			</div>
			{onPace !== null && read.targetDate !== null && (
				<p className="m-0 mb-2 text-muted-foreground text-xs">
					Finish by {new Date(read.targetDate).toLocaleDateString()} ·{" "}
					{onPace ? "you're on pace" : "you're behind pace"}
				</p>
			)}
			{detail.data?.originUnavailable ? (
				<p className="m-0 text-muted-foreground text-sm">This book is no longer available.</p>
			) : others.length === 0 ? (
				<p className="m-0 text-muted-foreground text-sm">
					{read.pendingInvites > 0 ? "Waiting for your friends to join." : "Nobody else yet."}
				</p>
			) : (
				<ul className="m-0 flex list-none flex-col gap-2 p-0">
					{others.map((p) => (
						<li key={p.identity.userId} className="flex items-center gap-3 text-sm">
							<SocialAvatar name={p.identity.name} avatarUrl={p.identity.avatarUrl} size="sm" />
							<span className="min-w-0 flex-1 truncate">{p.identity.name}</span>
							<span className="text-muted-foreground text-xs">
								{p.finishedAt !== null ? "Finished" : p.percent !== null ? `${p.percent}%` : "–"}
							</span>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

/** Starts a buddy read on this book. Signed out, it explains sign-in instead. */
export function StartBuddyReadSheet({
	isOpen,
	onClose,
	isLoggedIn,
	bookId,
	bookTitle,
	blocker,
}: {
	isOpen: boolean;
	onClose: () => void;
	isLoggedIn: boolean;
	bookId: string;
	bookTitle: string;
	blocker: string | null;
}) {
	const router = useRouter();
	const create = useCreateBuddyRead();
	const [error, setError] = useState<string | null>(null);

	if (!isLoggedIn) {
		return (
			<Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
				<DrawerContent>
					<DrawerHeader>
						<DrawerTitle>Read together</DrawerTitle>
					</DrawerHeader>
					<div className="px-4 pb-8">
						<SignedOutSocial returnTo={`/tabs/library/book/${bookId}`} />
					</div>
				</DrawerContent>
			</Drawer>
		);
	}
	return (
		<FriendPickerSheet
			isOpen={isOpen}
			onClose={() => {
				setError(null);
				onClose();
			}}
			title={`Read "${bookTitle}" together`}
			intro={
				<>
					<Users className="mr-1 inline size-3.5" />
					Invite friends to read this book with you. Everyone who joins sees each other's progress
					on it; friends without the book get their own copy. Up to 8 people, you included.
				</>
			}
			blocker={blocker}
			maxSelected={7}
			allowEmpty
			submitLabel="Start buddy read"
			pendingLabel="Starting…"
			isPending={create.isPending}
			error={error}
			onSubmit={(inviteeIds) => {
				setError(null);
				create.mutate(
					{ bookId, inviteeIds },
					{
						onSuccess: ({ buddyReadId }) => {
							toast.success(
								inviteeIds.length > 0 ? "Buddy read started. Invites sent." : "Buddy read started.",
							);
							onClose();
							router.navigate({ to: "/tabs/social/buddy-read/$id", params: { id: buddyReadId } });
						},
						onError: (err) =>
							setError(
								buddyReadErrorReason(err) === "already_member"
									? "You already have a buddy read running for this book."
									: buddyReadFailureMessage(err),
							),
					},
				);
			}}
		/>
	);
}
