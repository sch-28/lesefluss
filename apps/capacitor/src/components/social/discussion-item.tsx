import type {
	BuddyReaction,
	DiscussionItem,
	DiscussionReply,
	ReactionSummary,
} from "@lesefluss/core";
import { BUDDY_COMMENT_MAX_CHARS, BUDDY_REACTIONS } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { SocialAvatar } from "@lesefluss/ui/social-avatar";
import { cn } from "@lesefluss/ui/utils";
import { Flag, MoreHorizontal, Pencil, Reply, SmilePlus, Trash2, Undo2 } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { ActionSheet, type ActionSheetItem } from "@/components/action-sheet";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { ReportTarget } from "@/components/social/report-sheet";
import { toast } from "@/components/toast";
import {
	discussionFailureMessage,
	type ReactionTarget,
	useDeleteComment,
	useEditComment,
	useReact,
	useReplyToComment,
	useUnshareHighlight,
} from "@/services/social/buddy-read-discussion";
import { formatAgo } from "@/utils/date-utils";

type Props = {
	item: DiscussionItem;
	buddyReadId: string;
	isOffline: boolean;
	onReport: (target: ReportTarget) => void;
};

function Author({
	author,
	removed,
	createdAt,
	edited,
}: {
	author: DiscussionItem["author"];
	removed: boolean;
	createdAt: number;
	edited: boolean;
}) {
	return (
		<div className="flex min-w-0 items-center gap-2">
			{author ? (
				<SocialAvatar name={author.name} avatarUrl={author.avatarUrl} size="sm" />
			) : (
				<span className="size-8 shrink-0 rounded-full bg-muted" />
			)}
			<div className="min-w-0 text-xs">
				<div className="truncate font-medium text-foreground text-sm">
					{removed ? "Removed" : (author?.name ?? "Former member")}
				</div>
				<div className="truncate text-muted-foreground">
					{author ? `@${author.handle} · ` : ""}
					{formatAgo(createdAt)}
					{edited ? " · edited" : ""}
				</div>
			</div>
		</div>
	);
}

function Reactions({
	reactions,
	target,
	buddyReadId,
	disabled,
	trailing,
}: {
	reactions: ReactionSummary[];
	target: ReactionTarget;
	buddyReadId: string;
	disabled: boolean;
	trailing?: React.ReactNode;
}) {
	const react = useReact(buddyReadId);
	const [isPicking, setIsPicking] = useState(false);
	const toggle = (emoji: BuddyReaction, mine: boolean) =>
		react.mutate(
			{ ...target, emoji, remove: mine },
			{ onError: (err) => toast.error(discussionFailureMessage(err)) },
		);
	return (
		<div className="mt-2 flex flex-wrap items-center gap-1.5">
			{reactions.map((r) => (
				<button
					key={r.emoji}
					type="button"
					disabled={disabled || react.isPending}
					onClick={() => toggle(r.emoji, r.mine)}
					aria-pressed={r.mine}
					className={cn(
						"rounded-full border px-2 py-0.5 text-xs",
						r.mine ? "border-primary bg-primary/10" : "border-border",
					)}
				>
					{r.emoji} {r.count}
				</button>
			))}
			{isPicking ? (
				<div className="flex gap-1">
					{BUDDY_REACTIONS.map((emoji) => (
						<button
							key={emoji}
							type="button"
							disabled={disabled || react.isPending}
							onClick={() => {
								setIsPicking(false);
								const mine = reactions.find((r) => r.emoji === emoji)?.mine ?? false;
								toggle(emoji, mine);
							}}
							className="rounded-full px-1 text-base"
							aria-label={`React with ${emoji}`}
						>
							{emoji}
						</button>
					))}
				</div>
			) : (
				<button
					type="button"
					disabled={disabled}
					onClick={() => setIsPicking(true)}
					className="rounded-full p-1 text-muted-foreground"
					aria-label="Add reaction"
				>
					<SmilePlus className="size-4" />
				</button>
			)}
			{trailing && <div className="ml-auto">{trailing}</div>}
		</div>
	);
}

/** A body editor for replies and edits; the draft survives a failed send. */
export function CommentDraft({
	initial = "",
	placeholder,
	submitLabel,
	isPending,
	disabled,
	onSubmit,
	onCancel,
	autoFocus = false,
}: {
	initial?: string;
	placeholder: string;
	submitLabel: string;
	isPending: boolean;
	disabled: boolean;
	onSubmit: (body: string, done: () => void) => void;
	onCancel?: () => void;
	/** Inline drafts open on a tap and take the keyboard; inside a sheet the sheet manages focus. */
	autoFocus?: boolean;
}) {
	const [body, setBody] = useState(initial);
	const fieldRef = useRef<HTMLTextAreaElement>(null);
	useEffect(() => {
		if (autoFocus) fieldRef.current?.focus();
	}, [autoFocus]);
	const trimmed = body.trim();
	const tooLong = trimmed.length > BUDDY_COMMENT_MAX_CHARS;
	return (
		<div className="mt-2 flex flex-col gap-2">
			<textarea
				ref={fieldRef}
				value={body}
				onChange={(e) => setBody(e.target.value)}
				placeholder={placeholder}
				rows={3}
				disabled={isPending}
				className="w-full rounded-md border border-border bg-background p-2 text-foreground text-sm"
			/>
			{tooLong && (
				<p className="m-0 text-destructive text-xs">
					At most {BUDDY_COMMENT_MAX_CHARS.toLocaleString()} characters.
				</p>
			)}
			<div className="flex justify-end gap-2">
				{onCancel && (
					<Button size="sm" variant="ghost" disabled={isPending} onClick={onCancel}>
						Cancel
					</Button>
				)}
				<Button
					size="sm"
					disabled={disabled || isPending || trimmed.length === 0 || tooLong}
					onClick={() => onSubmit(trimmed, () => setBody(""))}
				>
					{isPending ? "Sending…" : submitLabel}
				</Button>
			</div>
		</div>
	);
}

function ReplyRow({
	reply,
	buddyReadId,
	isOffline,
	onMenu,
}: {
	reply: DiscussionReply;
	buddyReadId: string;
	isOffline: boolean;
	onMenu: () => void;
}) {
	return (
		<div className="mt-3 border-border border-l-2 pl-3">
			<div className="flex items-start justify-between gap-2">
				<Author
					author={reply.author}
					removed={reply.removed}
					createdAt={reply.createdAt}
					edited={reply.editedAt !== null}
				/>
				<Button variant="ghost" size="icon" aria-label="More" disabled={isOffline} onClick={onMenu}>
					<MoreHorizontal className="size-4" />
				</Button>
			</div>
			<p className="mt-1 mb-0 whitespace-pre-wrap text-foreground text-sm">{reply.body}</p>
			<Reactions
				reactions={reply.reactions}
				target={{ commentId: reply.id }}
				buddyReadId={buddyReadId}
				disabled={isOffline}
			/>
		</div>
	);
}

type Editing = { id: string; body: string } | null;

export function DiscussionItemCard({ item, buddyReadId, isOffline, onReport }: Props) {
	const reply = useReplyToComment(buddyReadId);
	const edit = useEditComment(buddyReadId);
	const remove = useDeleteComment(buddyReadId);
	const unshare = useUnshareHighlight(buddyReadId);
	const [isReplying, setIsReplying] = useState(false);
	const [editing, setEditing] = useState<Editing>(null);
	const [menu, setMenu] = useState<ActionSheetItem[] | null>(null);
	const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
	const onError = (err: unknown) => toast.error(discussionFailureMessage(err));

	const menuFor = (target: DiscussionItem | DiscussionReply, isHighlight: boolean) => {
		const items: ActionSheetItem[] = [];
		if (target.isOwn && !isHighlight && "body" in target && target.body !== null) {
			items.push({
				label: "Edit",
				icon: Pencil,
				onSelect: () => setEditing({ id: target.id, body: target.body ?? "" }),
			});
			items.push({
				label: "Delete",
				icon: Trash2,
				destructive: true,
				onSelect: () => setConfirmDelete(target.id),
			});
		}
		if (target.isOwn && isHighlight) {
			items.push({
				label: "Unshare",
				icon: Undo2,
				onSelect: () => unshare.mutate(target.id, { onError }),
			});
		}
		if (!target.isOwn && target.author) {
			items.push({
				label: "Report",
				icon: Flag,
				onSelect: () =>
					onReport({
						type: isHighlight ? "buddy_read_highlight" : "buddy_read_comment",
						userId: target.author?.userId ?? "",
						name: target.author?.name ?? "",
						subjectId: target.id,
					}),
			});
		}
		setMenu(items);
	};

	const isHighlight = item.kind === "highlight";
	const removed = item.kind === "comment" && item.removed;
	return (
		<article className="px-4 py-3">
			<div className="flex items-start justify-between gap-2">
				<Author
					author={item.author}
					removed={removed}
					createdAt={item.createdAt}
					edited={item.kind === "comment" && item.editedAt !== null}
				/>
				{!removed && (
					<Button
						variant="ghost"
						size="icon"
						aria-label="More"
						disabled={isOffline}
						onClick={() => menuFor(item, isHighlight)}
					>
						<MoreHorizontal className="size-4" />
					</Button>
				)}
			</div>
			{item.kind === "highlight" ? (
				<div className="mt-2">
					<blockquote className="m-0 border-primary/60 border-l-2 pl-3 text-foreground text-sm italic">
						"{item.text}"
					</blockquote>
					{item.note && <p className="mt-1 mb-0 text-muted-foreground text-sm">{item.note}</p>}
				</div>
			) : editing?.id === item.id ? (
				<CommentDraft
					autoFocus
					initial={editing.body}
					placeholder="Your comment"
					submitLabel="Save"
					isPending={edit.isPending}
					disabled={isOffline}
					onCancel={() => setEditing(null)}
					onSubmit={(body) =>
						edit.mutate(
							{ commentId: item.id, body },
							{ onSuccess: () => setEditing(null), onError },
						)
					}
				/>
			) : (
				<p className="mt-2 mb-0 whitespace-pre-wrap text-foreground text-sm">
					{removed ? (
						<span className="text-muted-foreground italic">This comment was removed.</span>
					) : (
						item.body
					)}
				</p>
			)}
			{!removed && (
				<Reactions
					reactions={item.reactions}
					target={isHighlight ? { sharedHighlightId: item.id } : { commentId: item.id }}
					buddyReadId={buddyReadId}
					disabled={isOffline}
					trailing={
						item.kind === "comment" &&
						!isReplying && (
							<Button
								size="sm"
								variant="ghost"
								className="h-7 px-2 text-muted-foreground"
								disabled={isOffline}
								onClick={() => setIsReplying(true)}
							>
								<Reply className="size-4" />
								Reply
							</Button>
						)
					}
				/>
			)}
			{item.kind === "comment" &&
				item.replies.map((r) =>
					editing?.id === r.id ? (
						<CommentDraft
							autoFocus
							key={r.id}
							initial={editing.body}
							placeholder="Your reply"
							submitLabel="Save"
							isPending={edit.isPending}
							disabled={isOffline}
							onCancel={() => setEditing(null)}
							onSubmit={(body) =>
								edit.mutate(
									{ commentId: r.id, body },
									{ onSuccess: () => setEditing(null), onError },
								)
							}
						/>
					) : (
						<ReplyRow
							key={r.id}
							reply={r}
							buddyReadId={buddyReadId}
							isOffline={isOffline}
							onMenu={() => menuFor(r, false)}
						/>
					),
				)}
			{item.kind === "comment" && !removed && isReplying && (
				<CommentDraft
					autoFocus
					placeholder="Write a reply"
					submitLabel="Reply"
					isPending={reply.isPending}
					disabled={isOffline}
					onCancel={() => setIsReplying(false)}
					onSubmit={(body, done) =>
						reply.mutate(
							{ parentId: item.id, body },
							{
								onSuccess: () => {
									done();
									setIsReplying(false);
								},
								onError,
							},
						)
					}
				/>
			)}
			<ActionSheet
				open={menu !== null}
				onOpenChange={(open) => !open && setMenu(null)}
				items={menu ?? []}
			/>
			<ConfirmDialog
				open={confirmDelete !== null}
				onOpenChange={(open) => !open && setConfirmDelete(null)}
				title="Delete this comment?"
				description="It disappears for everyone. If others replied, their replies stay under a removed comment."
				confirmLabel="Delete"
				destructive
				onConfirm={() => confirmDelete && remove.mutate(confirmDelete, { onError })}
			/>
		</article>
	);
}
