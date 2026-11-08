import type { NextMilestone, ReachedMilestone } from "@lesefluss/core";
import { cn } from "@lesefluss/ui/utils";
import { Zap } from "lucide-react";
import {
	MILESTONE_HUES,
	milestoneFace,
	milestoneKey,
	milestoneProgress,
} from "../../services/stats/milestones";
import { formatShortDate } from "../../utils/date-utils";

function RsvpBadge() {
	return (
		<span className="absolute -right-0.5 -bottom-0.5 flex size-5 items-center justify-center rounded-full bg-black ring-2 ring-background">
			<Zap className="size-3 fill-[#ffd60a] text-[#ffd60a]" aria-label="RSVP" />
		</span>
	);
}

export function ReachedMedal({ milestone }: { milestone: ReachedMilestone }) {
	const face = milestoneFace(milestone.kind, milestone.threshold);
	const hue = MILESTONE_HUES[milestone.kind];
	return (
		<div className="flex flex-col items-center text-center" data-testid="milestone-medal">
			<div
				className="relative flex size-16 items-center justify-center rounded-full font-extrabold text-base text-white shadow-sm"
				style={{ background: `linear-gradient(145deg, ${hue.from}, ${hue.to})` }}
			>
				{face.value}
				{face.rsvp && <RsvpBadge />}
			</div>
			<span className="mt-1.5 font-medium text-xs leading-tight">{face.caption}</span>
			<span className="text-[11px] text-muted-foreground tabular-nums">
				{formatShortDate(milestone.reachedAt)}
			</span>
		</div>
	);
}

export function NextMedal({ milestone }: { milestone: NextMilestone }) {
	const face = milestoneFace(milestone.kind, milestone.threshold);
	const share = Math.max(0, Math.min(1, milestone.current / milestone.threshold));
	return (
		<div className="flex flex-col items-center text-center" data-testid="milestone-next">
			<div
				className="relative flex size-16 items-center justify-center rounded-full"
				style={{ background: `conic-gradient(#c94b2a ${share * 360}deg, #e8e2df 0)` }}
			>
				<div className="flex size-[52px] items-center justify-center rounded-full bg-background font-bold text-muted-foreground text-sm">
					{face.value}
				</div>
				{face.rsvp && <RsvpBadge />}
			</div>
			<span className="mt-1.5 font-medium text-xs leading-tight">{face.caption}</span>
			<span className="text-[11px] text-muted-foreground tabular-nums">
				{milestoneProgress(milestone)}
			</span>
		</div>
	);
}

export function MedalGrid({
	reached = [],
	next = [],
	className,
}: {
	reached?: readonly ReachedMilestone[];
	next?: readonly NextMilestone[];
	className?: string;
}) {
	return (
		// Wrapped and centred rather than a grid, so a short last row does not leave an orphan at the left.
		<div
			className={cn("flex flex-wrap justify-center gap-y-4 [&>*]:basis-1/3 [&>*]:px-1", className)}
		>
			{reached.map((m) => (
				<ReachedMedal key={milestoneKey(m)} milestone={m} />
			))}
			{next.map((m) => (
				<NextMedal key={milestoneKey(m)} milestone={m} />
			))}
		</div>
	);
}
