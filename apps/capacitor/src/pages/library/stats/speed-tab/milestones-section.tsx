import {
	MILESTONE_KINDS,
	MILESTONE_TIERS,
	type NextMilestone,
	type ReachedMilestone,
} from "@lesefluss/core";
import { ReservedCard } from "../../../../components/reserved-card";
import { queryHooks } from "../../../../services/db/hooks";
import {
	MILESTONE_HUES,
	milestoneFace,
	milestoneKey,
	milestoneProgressLine,
	milestoneTitle,
} from "../../../../services/stats/milestones";
import { formatShortDate } from "../../../../utils/date-utils";
import { STAT_ROW_HEIGHT, StatRow, StatsSection } from "../section-header";

const TOTAL_TIERS = MILESTONE_KINDS.reduce((sum, kind) => sum + MILESTONE_TIERS[kind].length, 0);
const NEXT_SHOWN = 3;
/** One reached row, the Next label and three next rows: the shape of a few weeks of reading. */
const SECTION_HEIGHT = STAT_ROW_HEIGHT * 4 + 37;

function MilestoneIcon({
	kind,
	threshold,
	isNext,
}: {
	kind: ReachedMilestone["kind"];
	threshold: number;
	isNext?: boolean;
}) {
	const face = milestoneFace(kind, threshold);
	const hue = MILESTONE_HUES[kind];
	return (
		<span
			aria-hidden="true"
			className={
				isNext
					? "flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-muted font-bold text-[0.8125rem] text-muted-foreground tabular-nums"
					: "flex size-10 shrink-0 items-center justify-center rounded-full font-bold text-[0.8125rem] text-white tabular-nums"
			}
			style={isNext ? undefined : { background: `linear-gradient(135deg, ${hue.from}, ${hue.to})` }}
		>
			{face.value}
		</span>
	);
}

function ReachedRow({ milestone }: { milestone: ReachedMilestone }) {
	return (
		<div data-testid="milestone-medal">
			<StatRow
				icon={<MilestoneIcon kind={milestone.kind} threshold={milestone.threshold} />}
				label={milestoneTitle(milestone.kind, milestone.threshold)}
				sub={formatShortDate(milestone.reachedAt)}
			/>
		</div>
	);
}

function NextRow({ milestone }: { milestone: NextMilestone }) {
	const fraction = Math.min(1, milestone.current / milestone.threshold);
	return (
		<div data-testid="milestone-next">
			<StatRow
				icon={<MilestoneIcon kind={milestone.kind} threshold={milestone.threshold} isNext />}
				label={milestoneTitle(milestone.kind, milestone.threshold)}
				sub={
					<>
						<span
							className="mt-1.5 block h-1 overflow-hidden rounded-full bg-muted"
							aria-hidden="true"
						>
							<span
								className="block h-full bg-primary"
								style={{ width: `${Math.round(fraction * 100)}%` }}
							/>
						</span>
						<span className="mt-1 block tabular-nums">{milestoneProgressLine(milestone)}</span>
					</>
				}
			/>
		</div>
	);
}

/** Reached milestones newest first, then the closest next ones with their progress. */
export function MilestonesSection() {
	const { data, isPending } = queryHooks.useStatsMilestones();
	if (isPending) return <ReservedCard isPending height={SECTION_HEIGHT} className="mt-6 px-4" />;
	if (!data || (data.reached.length === 0 && data.next.length === 0)) return null;
	const reachedTiers = data.reached.reduce(
		(sum, m) => sum + MILESTONE_TIERS[m.kind].indexOf(m.threshold) + 1,
		0,
	);
	const reached = [...data.reached].sort((a, b) => b.reachedAt - a.reachedAt);
	const next = data.next.slice(0, NEXT_SHOWN);
	return (
		<StatsSection
			title="Milestones"
			aside={`${reachedTiers} of ${TOTAL_TIERS}`}
			data-testid="speed-milestones"
		>
			<div className="[&>*:last-child>*]:border-b-0">
				{reached.map((m) => (
					<ReachedRow key={milestoneKey(m)} milestone={m} />
				))}
			</div>
			{next.length > 0 && (
				<>
					<div className="mt-4 mb-1 text-[0.8125rem] text-muted-foreground">Next</div>
					<div className="[&>*:last-child>*]:border-b-0">
						{next.map((m) => (
							<NextRow key={milestoneKey(m)} milestone={m} />
						))}
					</div>
				</>
			)}
		</StatsSection>
	);
}
