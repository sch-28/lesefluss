import type { OwnSocialProfile } from "@lesefluss/core";
import { SocialAvatar } from "@lesefluss/ui/social-avatar";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Flame } from "lucide-react";
import type React from "react";
import CoverImage from "@/components/cover-image";
import { CoverBackdrop } from "@/components/social/cover-backdrop";
import { ProgressBar, progressRing, useCurrentBook } from "@/components/social/social-ui";
import { queryHooks } from "@/services/db/hooks";
import { useBuddyReads } from "@/services/social/buddy-reads";

function Stat({ value, label, icon }: { value: number; label: string; icon?: React.ReactNode }) {
	return (
		<div className="min-w-0 border-border px-3 first:pl-1 [&:not(:first-child)]:border-l">
			<div className="flex items-center gap-1 font-bold text-[22px] tabular-nums leading-none">
				{value}
				{icon}
			</div>
			<div className="mt-1.5 truncate font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">
				{label}
			</div>
		</div>
	);
}

/** The reader's own card once they have friends: who they are, how they read, what they read now. */
export function MeHero({ me, friendCount }: { me: OwnSocialProfile; friendCount: number }) {
	const book = useCurrentBook();
	const streak = queryHooks.useStatsStreak();
	const reads = useBuddyReads();
	const activeReads = (reads.data ?? []).filter((r) => r.status === "in_progress").length;

	return (
		<Link
			to="/tabs/social/profile/$userId"
			params={{ userId: me.userId }}
			className="relative mt-4 block overflow-hidden rounded-3xl border border-border bg-card text-card-foreground no-underline"
		>
			<CoverBackdrop src={book?.coverSrc ?? null} />
			<div className="relative px-[18px] pt-5 pb-4">
				<div className="flex items-center gap-3.5">
					<div
						className="size-[74px] shrink-0 rounded-full p-1"
						style={{ background: progressRing(book?.percent ?? 0) }}
					>
						<div className="size-full rounded-full bg-card p-[3px]">
							<SocialAvatar
								name={me.name}
								avatarUrl={me.avatarUrl}
								size="lg"
								className="size-full text-xl"
							/>
						</div>
					</div>
					<div className="min-w-0 flex-1">
						<div className="truncate font-bold text-[21px] tracking-tight">{me.name}</div>
						<div className="mt-0.5 truncate text-[13px] text-muted-foreground">
							@{me.handle} · Your profile
						</div>
					</div>
					<ChevronRight className="size-[18px] self-start text-muted-foreground" />
				</div>

				<div className="mt-[18px] grid grid-cols-3">
					<Stat value={friendCount} label={friendCount === 1 ? "Friend" : "Friends"} />
					<Stat value={activeReads} label="Buddy reads" />
					<Stat
						value={streak.data?.current ?? 0}
						label="Day streak"
						icon={<Flame className="size-4 text-primary" />}
					/>
				</div>

				{book && (
					<div className="mt-4 flex items-center gap-3 rounded-2xl bg-card/75 p-2.5">
						<div className="relative aspect-[2/3] w-[30px] shrink-0 overflow-hidden rounded bg-muted">
							<CoverImage src={book.coverSrc} alt="" />
						</div>
						<div className="min-w-0 flex-1">
							<div className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">
								Now reading
							</div>
							<div className="mt-0.5 truncate font-semibold text-sm">{book.title}</div>
							<ProgressBar percent={book.percent} className="mt-1.5 h-1" />
						</div>
						<div className="font-bold text-[13px] tabular-nums">{book.percent}%</div>
					</div>
				)}
			</div>
		</Link>
	);
}
