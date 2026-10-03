import {
	type BuddyReadMemberPreview,
	type BuddyReadSummary,
	isOnPace,
	readingProgress,
} from "@lesefluss/core";
import { cn } from "@lesefluss/ui/utils";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import CoverImage from "@/components/cover-image";
import { queryHooks } from "@/services/db/hooks";
import { paceText } from "@/services/social/buddy-reads";
import { BuddyTrack, type TrackRider } from "./buddy-track";
import { CoverBackdrop } from "./cover-backdrop";
import { FinishedLabel, useLocalCover } from "./social-ui";

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

function ridersOf(read: BuddyReadSummary, me: BuddyReadMemberPreview | undefined): TrackRider[] {
	return read.members.map((m) => {
		const member = m.isSelf && me ? me : m;
		const percent = member.finished ? 100 : (member.percent ?? 0);
		return {
			key: m.identity.userId,
			name: m.identity.name,
			avatarUrl: m.identity.avatarUrl,
			percent,
			isSelf: m.isSelf,
			label: m.isSelf ? `You · ${percent}%` : undefined,
		};
	});
}

/**
 * One buddy read as a card: the local cover, everyone on the shared track and
 * the pace. The featured card leads with the cover over a blurred backdrop.
 */
export function BuddyReadCard({
	read,
	index = 0,
	isFeatured = false,
}: {
	read: BuddyReadSummary;
	index?: number;
	isFeatured?: boolean;
}) {
	const cover = useLocalCover(read.myBookId);
	const { data: myBook } = queryHooks.useBook(read.myBookId);
	const synced = read.members.find((m) => m.isSelf);
	// This device's position is fresher than the last one it pushed.
	const me =
		synced && myBook && myBook.wordCount > 0
			? { ...synced, percent: readingProgress(myBook) }
			: synced;
	const riders = ridersOf(read, me);
	const isFinished = read.status === "finished" || (me?.finished ?? false);
	const status = statusLine(read, me?.percent ?? null);
	const isAlone = read.members.length < 2;

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
				className={cn(
					"relative block overflow-hidden border border-border bg-card text-card-foreground no-underline active:scale-[0.99]",
					isFeatured ? "rounded-3xl p-4" : "rounded-2xl p-3",
				)}
			>
				{isFeatured && <CoverBackdrop src={cover} className="opacity-70" />}
				<div className="relative">
					<div className="flex gap-3.5">
						<div
							className={cn(
								"relative aspect-[2/3] shrink-0 overflow-hidden rounded-md bg-muted",
								isFeatured ? "w-[70px] shadow-lg" : "w-10",
							)}
						>
							<CoverImage src={cover} alt="" />
						</div>
						<div className="min-w-0 flex-1">
							<div
								className={cn("line-clamp-1 font-semibold", isFeatured ? "text-base" : "text-sm")}
							>
								{read.title}
							</div>
							{read.author && (
								<div className="mt-0.5 line-clamp-1 text-muted-foreground text-xs">
									{read.author}
								</div>
							)}
							<div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
								{isFinished ? (
									<FinishedLabel />
								) : (
									status && (
										<span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">
											{status}
										</span>
									)
								)}
								{isAlone && <span className="text-muted-foreground">Just you so far</span>}
							</div>
						</div>
					</div>
					{read.originUnavailable ? (
						<p className="m-0 mt-3 text-[11px] text-muted-foreground">
							This book is no longer available.
						</p>
					) : (
						<>
							<p className="sr-only">
								{riders.map((r) => `${r.isSelf ? "You" : r.name} ${r.percent}%`).join(", ")}
							</p>
							<BuddyTrack riders={riders} className={isFeatured ? "mt-4" : "mt-3"} />
						</>
					)}
				</div>
			</Link>
		</motion.div>
	);
}
