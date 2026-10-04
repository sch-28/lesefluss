import type { DiscussionAnchor, DiscussionItem } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@lesefluss/ui/drawer";
import { PenLine, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyRow } from "@/components/app-shell/section";
import { ToggleRow } from "@/components/app-shell/toggle-row";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CommentDraft, DiscussionItemCard } from "@/components/social/discussion-item";
import { ReportSheet, type ReportTarget } from "@/components/social/report-sheet";
import { ListCard, SocialSection } from "@/components/social/social-ui";
import { toast } from "@/components/toast";
import { queryHooks } from "@/services/db/hooks";
import { parseChapters } from "@/services/db/queries/books";
import {
	discussionFailureMessage,
	useDiscussion,
	useDiscussionSettings,
	usePostComment,
} from "@/services/social/buddy-read-discussion";
import { useBuddyRead } from "@/services/social/buddy-reads";
import { useIsOnline } from "@/services/social/cache";
import { currentChapterIndex } from "@/utils/chapters";
import { OfflineNotice, Spinner, StaleNotice } from "./social-gate";

type Confirm = { title: string; description: string; confirmLabel: string; run: () => void };

/** The Discussion tab of a buddy read. */
export function DiscussionPanel({ id }: { id: string }) {
	const isOnline = useIsOnline();
	const isOffline = !isOnline;
	const read = useBuddyRead(id);
	const discussion = useDiscussion(id);
	const { data: myBook } = queryHooks.useBook(read.data?.myBookId ?? "");
	const { data: myContent } = queryHooks.useBookContent(read.data?.myBookId ?? "");
	const chapters = useMemo(() => parseChapters(myContent?.chapters ?? null), [myContent?.chapters]);
	const post = usePostComment(id);
	const settings = useDiscussionSettings(id);
	const [target, setTarget] = useState<string>("position");
	const [isComposing, setIsComposing] = useState(false);
	const [isSettingsOpen, setIsSettingsOpen] = useState(false);
	const [confirm, setConfirm] = useState<Confirm | null>(null);
	const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
	const onError = (err: unknown) => toast.error(discussionFailureMessage(err));
	const askConfirm = (next: Confirm) => {
		setIsSettingsOpen(false);
		setConfirm(next);
	};

	const groups = useMemo(() => {
		const out: { title: string | null; items: DiscussionItem[] }[] = [];
		for (const item of discussion.data?.items ?? []) {
			const title =
				chapters.length > 0
					? (chapters[currentChapterIndex(chapters, item.startWord)]?.title ?? null)
					: null;
			const last = out[out.length - 1];
			if (last && last.title === title) last.items.push(item);
			else out.push({ title, items: [item] });
		}
		return out;
	}, [discussion.data?.items, chapters]);

	if (discussion.isPending) return <Spinner />;
	if (!discussion.data) {
		return (
			<OfflineNotice onRetry={() => void discussion.refetch()}>
				{isOnline
					? "Couldn't load the discussion. Try again."
					: "You're offline. The discussion will show once you're back online."}
			</OfflineNotice>
		);
	}
	const page = discussion.data;

	const anchorFor = (): DiscussionAnchor | null => {
		if (target === "position") {
			if (!myBook) return null;
			const word = Math.min(myBook.wordPosition, Math.max(0, myBook.wordCount - 1));
			return {
				kind: "range",
				startWord: word,
				startCharInWord: 0,
				endWord: word,
				endCharInWord: 0,
			};
		}
		return { kind: "chapter", startWord: Number(target) };
	};

	return (
		<>
			<StaleNotice
				isOnline={isOnline}
				isError={discussion.isError}
				onRetry={() => void discussion.refetch()}
			/>
			<div className="mt-3 flex items-start gap-2 px-1">
				<p className="m-0 flex-1 text-muted-foreground text-xs">
					Comments and shared highlights unlock as you reach them, so nobody sees ahead of where
					they are.
				</p>
				<Button
					variant="ghost"
					size="icon"
					aria-label="Discussion settings"
					onClick={() => setIsSettingsOpen(true)}
				>
					<SlidersHorizontal className="size-4" />
				</Button>
			</div>
			{isComposing ? (
				<div className="mt-3 rounded-xl border border-current/10 bg-card p-3">
					<select
						aria-label="What the comment is about"
						value={target}
						disabled={isOffline}
						onChange={(e) => setTarget(e.target.value)}
						className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-foreground text-sm"
					>
						<option value="position">At my current position</option>
						{chapters.map((c) => (
							<option key={c.startWord} value={String(c.startWord)}>
								About the chapter "{c.title}"
							</option>
						))}
					</select>
					<CommentDraft
						autoFocus
						placeholder={
							isOffline ? "You're offline." : "Share a thought. Others see it once they get here."
						}
						submitLabel="Post"
						isPending={post.isPending}
						disabled={isOffline || !myBook}
						onCancel={() => setIsComposing(false)}
						onSubmit={(body, done) => {
							const anchor = anchorFor();
							if (!anchor) return;
							post.mutate(
								{ buddyReadId: id, anchor, body },
								{
									onSuccess: () => {
										done();
										setIsComposing(false);
									},
									onError,
								},
							);
						}}
					/>
				</div>
			) : (
				<button
					type="button"
					onClick={() => setIsComposing(true)}
					className="mt-3 flex w-full items-center gap-2 rounded-xl border border-current/10 bg-card px-3 py-3 text-left text-muted-foreground text-sm"
				>
					<PenLine className="size-4" />
					Write something about the book…
				</button>
			)}

			{page.hiddenAhead > 0 && (
				<p className="mt-4 mb-0 rounded-lg border border-border bg-muted/40 px-4 py-2 text-muted-foreground text-sm">
					{page.hiddenAhead === 1
						? "1 comment or highlight is further ahead than you have read."
						: `${page.hiddenAhead} comments or highlights are further ahead than you have read.`}
				</p>
			)}

			{groups.length === 0 ? (
				<SocialSection title="Discussion">
					<ListCard>
						<EmptyRow>
							{page.hiddenAhead > 0
								? "Nothing unlocked yet. Keep reading."
								: "No comments yet. Start the conversation, or share a highlight from the reader."}
						</EmptyRow>
					</ListCard>
				</SocialSection>
			) : (
				groups.map((g) => (
					<SocialSection key={g.items[0]?.id ?? g.title ?? "book"} title={g.title ?? "The book"}>
						<ListCard>
							{g.items.map((item) => (
								<DiscussionItemCard
									key={item.id}
									item={item}
									buddyReadId={id}
									isOffline={isOffline}
									onReport={setReportTarget}
								/>
							))}
						</ListCard>
					</SocialSection>
				))
			)}

			<Drawer open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
				<DrawerContent>
					<DrawerHeader>
						<DrawerTitle>Discussion settings</DrawerTitle>
					</DrawerHeader>
					<div className="divide-y divide-border pb-6">
						<ToggleRow
							title="Share all my highlights"
							subtitle="Every highlight you make in this book shows here, notes included."
							checked={page.shareAllHighlights}
							disabled={isOffline || settings.isPending}
							onCheckedChange={(value) =>
								value
									? askConfirm({
											title: "Share all your highlights?",
											description:
												"Everyone in this buddy read sees all your highlights in this book, including your notes, now and in future. You can switch this off again.",
											confirmLabel: "Share all",
											run: () =>
												settings.mutate({ buddyReadId: id, shareAllHighlights: true }, { onError }),
										})
									: settings.mutate({ buddyReadId: id, shareAllHighlights: false }, { onError })
							}
						/>
						<ToggleRow
							title="Show everything"
							subtitle="Also show comments and highlights further ahead than you have read."
							checked={page.showEverything}
							disabled={isOffline || settings.isPending}
							onCheckedChange={(value) =>
								value
									? askConfirm({
											title: "Show spoilers?",
											description:
												"You will see what others wrote about parts of the book you haven't read yet. You can switch this off again.",
											confirmLabel: "Show everything",
											run: () =>
												settings.mutate({ buddyReadId: id, showEverything: true }, { onError }),
										})
									: settings.mutate({ buddyReadId: id, showEverything: false }, { onError })
							}
						/>
					</div>
				</DrawerContent>
			</Drawer>

			<ReportSheet target={reportTarget} onClose={() => setReportTarget(null)} />
			<ConfirmDialog
				open={confirm !== null}
				onOpenChange={(open) => !open && setConfirm(null)}
				title={confirm?.title ?? ""}
				description={confirm?.description}
				confirmLabel={confirm?.confirmLabel}
				onConfirm={() => confirm?.run()}
			/>
		</>
	);
}
