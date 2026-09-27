import type { SocialIdentity } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import {
	Drawer,
	DrawerContent,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "@lesefluss/ui/drawer";
import { SocialAvatar } from "@lesefluss/ui/social-avatar";
import { Link } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "@/components/toast";
import { useRelationships } from "@/services/social/friends";
import { shareErrorReason, shareFailureMessage, useCreateShare } from "@/services/social/shares";

/** Why a book cannot be shared right now, decided by the caller from local state; `checking` while that is still being read. */
export type ShareBlocker = "local_only" | "not_synced" | "series" | "checking";

const BLOCKER_TEXT: Record<ShareBlocker, string> = {
	local_only: "This book is stored on this device only, so it can't be shared.",
	not_synced: "This book hasn't reached the cloud yet. Sync first, then share.",
	series: "Web-serial chapters can't be shared.",
	checking: "Checking whether this book is in the cloud…",
};

export function ShareSheet({
	isOpen,
	onClose,
	bookId,
	bookTitle,
	blocker,
}: {
	isOpen: boolean;
	onClose: () => void;
	bookId: string;
	bookTitle: string;
	blocker: ShareBlocker | null;
}) {
	const relationships = useRelationships(isOpen && blocker === null);
	const share = useCreateShare();
	const [recipient, setRecipient] = useState<SocialIdentity | null>(null);
	const [needsConsent, setNeedsConsent] = useState(false);
	const [confirmRights, setConfirmRights] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const reset = () => {
		setRecipient(null);
		setNeedsConsent(false);
		setConfirmRights(false);
		setError(null);
	};
	// biome-ignore lint/correctness/useExhaustiveDependencies: a fresh open starts clean
	useEffect(() => {
		if (isOpen) reset();
	}, [isOpen, bookId]);

	const submit = () => {
		if (!recipient) return;
		setError(null);
		share.mutate(
			{
				recipientId: recipient.userId,
				bookId,
				confirmRights: needsConsent ? confirmRights : undefined,
			},
			{
				onSuccess: () => {
					toast.success(`Shared with ${recipient.name}. They'll find it in their inbox.`);
					onClose();
				},
				onError: (err) => {
					// The first share ever asks for the rights confirmation; show the box and keep the pick.
					if (shareErrorReason(err) === "consent_required" && !needsConsent) {
						setNeedsConsent(true);
						return;
					}
					setError(shareFailureMessage(err));
				},
			},
		);
	};

	const friends = relationships.data?.friends ?? [];
	const canSubmit = recipient !== null && !share.isPending && (!needsConsent || confirmRights);

	return (
		<Drawer
			open={isOpen}
			dismissible={!share.isPending}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DrawerContent>
				<DrawerHeader>
					<DrawerTitle className="truncate">Share "{bookTitle}"</DrawerTitle>
				</DrawerHeader>
				<div className="flex max-h-[65vh] flex-col gap-3 overflow-y-auto px-4 pb-2">
					{blocker ? (
						<p className="m-0 text-muted-foreground text-sm">{BLOCKER_TEXT[blocker]}</p>
					) : relationships.isPending ? (
						<p className="m-0 text-muted-foreground text-sm">Loading your friends…</p>
					) : relationships.isError ? (
						<div className="flex flex-col gap-2">
							<p className="m-0 text-muted-foreground text-sm">Couldn't load your friends.</p>
							<Button variant="outline" size="sm" onClick={() => void relationships.refetch()}>
								Retry
							</Button>
						</div>
					) : friends.length === 0 ? (
						<div className="flex flex-col items-center gap-2 py-4 text-center">
							<Users className="size-6 text-muted-foreground" />
							<p className="m-0 text-muted-foreground text-sm">
								Books are shared with friends. Add one first.
							</p>
							<Button asChild variant="outline" size="sm" onClick={onClose}>
								<Link to="/tabs/social">Open Social</Link>
							</Button>
						</div>
					) : (
						<>
							<p className="m-0 text-muted-foreground text-xs">
								Your friend gets their own copy with the same text. You keep yours.
							</p>
							<fieldset className="flex flex-col">
								{friends.map((friend) => (
									<label
										key={friend.userId}
										className="flex items-center gap-3 rounded-md px-1 py-2 text-sm has-[:checked]:bg-muted"
									>
										<input
											type="radio"
											name="share-recipient"
											checked={recipient?.userId === friend.userId}
											onChange={() => setRecipient(friend)}
											disabled={share.isPending}
										/>
										<SocialAvatar name={friend.name} avatarUrl={friend.avatarUrl} size="md" />
										<span className="min-w-0 flex-1">
											<span className="block truncate font-medium text-foreground">
												{friend.name}
											</span>
											<span className="block truncate text-muted-foreground text-xs">
												@{friend.handle}
											</span>
										</span>
									</label>
								))}
							</fieldset>
							{needsConsent && (
								<label className="flex items-start gap-3 rounded-md border border-border p-3 text-sm">
									<input
										type="checkbox"
										checked={confirmRights}
										onChange={(e) => setConfirmRights(e.target.checked)}
										className="mt-0.5"
									/>
									<span>
										<span className="font-medium">I have the right to share this book</span>
										<span className="mt-1 block text-muted-foreground text-xs">
											Share only books you may pass on to this person, for example your own writing,
											public-domain works or files you are licensed to share. Asked once.
										</span>
									</span>
								</label>
							)}
							{error && (
								<p className="m-0 text-destructive text-sm" role="alert">
									{error}
								</p>
							)}
						</>
					)}
				</div>
				<DrawerFooter className="flex-row gap-2">
					<Button variant="outline" className="flex-1" disabled={share.isPending} onClick={onClose}>
						{blocker || friends.length === 0 ? "Close" : "Cancel"}
					</Button>
					{!blocker && friends.length > 0 && (
						<Button className="flex-1" disabled={!canSubmit} onClick={submit}>
							{share.isPending ? "Sharing…" : "Share"}
						</Button>
					)}
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
}
