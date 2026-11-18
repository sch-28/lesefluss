import type { OwnSocialProfile } from "@lesefluss/core";
import { SocialAvatar } from "@lesefluss/ui/social-avatar";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Flame } from "lucide-react";
import type React from "react";
import CoverImage from "@/components/cover-image";
import { CoverBackdrop } from "@/components/social/cover-backdrop";
import { ProgressBar, useCurrentBook } from "@/components/social/social-ui";
import { queryHooks } from "@/services/db/hooks";
import { useBuddyReads } from "@/services/social/buddy-reads";
import { formatPercent } from "@/utils/format-percent";

function Stat({ value, label, icon }: { value: number; label: string; icon?: React.ReactNode }) {
	return (
		<div className="min-w-0 border-border px-3 first:pl-1 [&:not(:first-child)]:border-l">
			<div className="flex items-center gap-1 font-semibold text-2xl tabular-nums leading-none">
				{value}
				{icon}
			</div>
			<div className="mt-1 truncate text-2xs text-muted-foreground">{label}</div>
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
			<div className="relative px-4 pt-5 pb-4">
				<div className="flex items-center gap-3">
					<SocialAvatar
						name={me.name}
						avatarUrl={me.avatarUrl}
						className="size-[74px] shrink-0 text-xl"
					/>
					<div className="min-w-0 flex-1">
						<div className="truncate font-semibold text-2xl tracking-tight">{me.name}</div>
						<div className="mt-0.5 truncate text-muted-foreground text-sm">
							@{me.handle} · Your profile
						</div>
					</div>
					<ChevronRight className="size-4 self-start text-muted-foreground" />
				</div>

				<div className="mt-4 grid grid-cols-3">
					<Stat value={friendCount} label={friendCount === 1 ? "Friend" : "Friends"} />
					<Stat value={activeReads} label="Buddy reads" />
					<Stat
						value={streak.data?.current ?? 0}
						label="Day streak"
						icon={<Flame className="size-4 text-primary" />}
					/>
				</div>

				{book && (
					<div className="mt-4 flex items-center gap-3 rounded-2xl bg-card/75 p-3">
						<div className="relative aspect-[2/3] w-[30px] shrink-0 overflow-hidden rounded-sm bg-muted">
							<CoverImage src={book.coverSrc} alt="" />
						</div>
						<div className="min-w-0 flex-1">
							<div className="font-semibold text-2xs text-muted-foreground">Now reading</div>
							<div className="mt-0.5 truncate font-semibold text-sm">{book.title}</div>
							<ProgressBar percent={book.percent} className="mt-1.5 h-1" />
						</div>
						<div className="font-semibold text-sm tabular-nums">{formatPercent(book.percent)}</div>
					</div>
				)}
			</div>
		</Link>
	);
}
