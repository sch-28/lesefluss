import type { DiscussionItem } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import {
	Drawer,
	DrawerContent,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "@lesefluss/ui/drawer";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { CommentDraft, DiscussionItemCard } from "@/components/social/discussion-item";
import { ReportSheet, type ReportTarget } from "@/components/social/report-sheet";
import { toast } from "@/components/toast";
import type { Highlight } from "@/services/db/schema";
import {
	discussionFailureMessage,
	usePostComment,
	useShareHighlight,
} from "@/services/social/buddy-read-discussion";
import { useIsOnline } from "@/services/social/cache";

/** The unlocked items at one spot in the book, opened from a reader marker. */
export function DiscussionThreadSheet({
	buddyReadId,
	items,
	onClose,
	theme,
}: {
	buddyReadId: string;
	items: DiscussionItem[] | null;
	onClose: () => void;
	theme?: string;
}) {
	const isOnline = useIsOnline();
	const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
	return (
		<>
			<Drawer open={Boolean(items?.length)} onOpenChange={(open) => !open && onClose()}>
				<DrawerContent className={theme ? `reader-theme-${theme}` : undefined}>
					<DrawerHeader>
						<DrawerTitle>Discussion</DrawerTitle>
					</DrawerHeader>
					<div className="max-h-[60vh] divide-y divide-border overflow-y-auto">
						{(items ?? []).map((item) => (
							<DiscussionItemCard
								key={item.id}
								item={item}
								buddyReadId={buddyReadId}
								isOffline={!isOnline}
								onReport={setReportTarget}
							/>
						))}
					</div>
					<DrawerFooter>
						<Button asChild variant="outline" onClick={onClose}>
							<Link
								to="/tabs/social/buddy-read/$id"
								params={{ id: buddyReadId }}
								search={{ tab: "discussion" }}
							>
								Open the whole discussion
							</Link>
						</Button>
					</DrawerFooter>
				</DrawerContent>
			</Drawer>
			<ReportSheet target={reportTarget} onClose={() => setReportTarget(null)} />
		</>
	);
}

export type CommentSelection = { startWord: number; endWord: number; snippet: string };

/** A comment on the passage selected in the reader. */
export function CommentComposerSheet({
	buddyReadId,
	selection,
	onClose,
	theme,
}: {
	buddyReadId: string;
	selection: CommentSelection | null;
	onClose: () => void;
	theme?: string;
}) {
	const isOnline = useIsOnline();
	const post = usePostComment(buddyReadId);
	return (
		<Drawer
			open={selection !== null}
			dismissible={!post.isPending}
			onOpenChange={(open) => !open && onClose()}
		>
			<DrawerContent className={theme ? `reader-theme-${theme}` : undefined}>
				<DrawerHeader>
					<DrawerTitle>Comment on this passage</DrawerTitle>
				</DrawerHeader>
				<div className="px-4 pb-6">
					{selection?.snippet && (
						<blockquote className="m-0 border-border border-l-2 pl-3 text-muted-foreground text-sm italic">
							"{selection.snippet}"
						</blockquote>
					)}
					<p className="mt-2 mb-0 text-muted-foreground text-xs">
						Others in the buddy read see it once they have read past this passage.
					</p>
					<CommentDraft
						placeholder={isOnline ? "Your comment" : "You're offline."}
						submitLabel="Post"
						isPending={post.isPending}
						disabled={!isOnline}
						onSubmit={(body, done) => {
							if (!selection) return;
							post.mutate(
								{
									buddyReadId,
									anchor: {
										kind: "range",
										startWord: selection.startWord,
										startCharInWord: 0,
										endWord: selection.endWord,
										endCharInWord: 0,
									},
									body,
								},
								{
									onSuccess: () => {
										done();
										toast.success("Comment posted.");
										onClose();
									},
									onError: (err) => toast.error(discussionFailureMessage(err)),
								},
							);
						}}
					/>
				</div>
			</DrawerContent>
		</Drawer>
	);
}

/** Shows exactly what the others will see before a highlight goes to the buddy read. */
export function ShareHighlightSheet({
	buddyReadId,
	highlight,
	text,
	syncNow,
	onClose,
	theme,
}: {
	buddyReadId: string;
	highlight: Highlight | null;
	text: string;
	syncNow: () => Promise<void>;
	onClose: () => void;
	theme?: string;
}) {
	const isOnline = useIsOnline();
	const share = useShareHighlight(buddyReadId, syncNow);
	const snippet = highlight?.text || text;
	return (
		<Drawer
			open={highlight !== null}
			dismissible={!share.isPending}
			onOpenChange={(open) => !open && onClose()}
		>
			<DrawerContent className={theme ? `reader-theme-${theme}` : undefined}>
				<DrawerHeader>
					<DrawerTitle>Share to the buddy read</DrawerTitle>
				</DrawerHeader>
				<div className="flex flex-col gap-2 px-4 pb-2">
					<p className="m-0 text-muted-foreground text-xs">
						Everyone in this buddy read sees this, once they have read this far:
					</p>
					<blockquote className="m-0 border-primary/60 border-l-2 pl-3 text-foreground text-sm italic">
						"{snippet}"
					</blockquote>
					{highlight?.note ? (
						<p className="m-0 text-foreground text-sm">Your note: {highlight.note}</p>
					) : (
						<p className="m-0 text-muted-foreground text-xs">No note.</p>
					)}
				</div>
				<DrawerFooter className="flex-row gap-2">
					<Button variant="outline" className="flex-1" disabled={share.isPending} onClick={onClose}>
						Cancel
					</Button>
					<Button
						className="flex-1"
						disabled={!isOnline || share.isPending || !snippet || !highlight}
						onClick={() =>
							highlight &&
							share.mutate(
								{ highlight, text },
								{
									onSuccess: () => {
										toast.success("Shared to the buddy read.");
										onClose();
									},
									onError: (err) => toast.error(discussionFailureMessage(err)),
								},
							)
						}
					>
						{share.isPending ? "Sharing…" : "Share"}
					</Button>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
}
