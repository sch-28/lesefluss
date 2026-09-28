import { type BuddyReadSummary, isOnPace, readingProgress } from "@lesefluss/core";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import CoverImage from "@/components/cover-image";
import { queryHooks } from "@/services/db/hooks";
import { paceText } from "@/services/social/buddy-reads";
import { AvatarStack, FinishedLabel, ProgressBar, useLocalCover } from "./social-ui";

function statusLine(read: BuddyReadSummary, myPercent: number | null): string | null {
	if (read.targetDate === null) return null;
	const due = new Date(read.targetDate).toLocaleDateString(undefined, {
		day: "numeric",
		month: "short",
	});
	const onPace = isOnPace({
		percent: myPercent,
		createdAt: read.createdAt,
		targetDate: read.targetDate,
		now: Date.now(),
	});
	return onPace === null ? `Finish by ${due}` : `Finish by ${due} · ${paceText(onPace)}`;
}

/** One buddy read as a card: the local cover, your progress and who reads along. */
export function BuddyReadCard({ read, index = 0 }: { read: BuddyReadSummary; index?: number }) {
	const cover = useLocalCover(read.myBookId);
	const { data: myBook } = queryHooks.useBook(read.myBookId);
	const synced = read.members.find((m) => m.isSelf);
	// This device's position is fresher than the last one it pushed.
	const me =
		synced && myBook && myBook.wordCount > 0
			? { ...synced, percent: readingProgress(myBook) }
			: synced;
	const others = read.members.filter((m) => !m.isSelf);
	const isFinished = read.status === "finished" || (me?.finished ?? false);
	const status = statusLine(read, me?.percent ?? null);

	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true }}
			transition={{ duration: 0.35, delay: index * 0.05 }}
		>
			<Link
				to="/tabs/social/buddy-read/$id"
				params={{ id: read.id }}
				className="flex gap-3 rounded-xl border border-current/10 bg-card p-3 text-card-foreground no-underline active:scale-[0.99]"
			>
				<div className="relative aspect-[2/3] w-14 shrink-0 overflow-hidden rounded-md bg-muted">
					<CoverImage src={cover} alt={read.title} />
				</div>
				<div className="flex min-w-0 flex-1 flex-col">
					<div className="line-clamp-1 font-medium text-sm">{read.title}</div>
					{read.author && (
						<div className="mt-0.5 line-clamp-1 text-[11px] opacity-60">{read.author}</div>
					)}
					{!read.originUnavailable && (
						<div className="mt-2 flex items-center gap-2">
							<ProgressBar percent={me?.percent ?? null} finished={isFinished} className="flex-1" />
							<span className="w-9 text-right text-[11px] text-muted-foreground tabular-nums">
								{!isFinished && me?.percent != null ? `${me.percent}%` : ""}
							</span>
						</div>
					)}
					{read.originUnavailable ? (
						<p className="m-0 mt-auto pt-2 text-[11px] text-muted-foreground">
							This book is no longer available.
						</p>
					) : (
						<div className="mt-auto flex items-center justify-between gap-2 pt-2">
							{others.length > 0 ? (
								<AvatarStack people={others.map((m) => m.identity)} />
							) : (
								<span className="text-[11px] text-muted-foreground">Just you so far</span>
							)}
							{isFinished ? (
								<FinishedLabel className="text-[11px]" />
							) : (
								status && (
									<span className="truncate text-[11px] text-muted-foreground">{status}</span>
								)
							)}
						</div>
					)}
				</div>
			</Link>
		</motion.div>
	);
}
