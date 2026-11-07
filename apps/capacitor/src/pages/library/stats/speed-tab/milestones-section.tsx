import { MILESTONE_KINDS, MILESTONE_TIERS } from "@lesefluss/core";
import { MedalGrid } from "../../../../components/milestones/milestone-medals";
import { queryHooks } from "../../../../services/db/hooks";

const TOTAL_TIERS = MILESTONE_KINDS.reduce((sum, kind) => sum + MILESTONE_TIERS[kind].length, 0);

export function MilestonesSection() {
	const { data } = queryHooks.useStatsMilestones();
	if (!data || (data.reached.length === 0 && data.next.length === 0)) return null;
	const reachedTiers = data.reached.reduce(
		(sum, m) => sum + MILESTONE_TIERS[m.kind].indexOf(m.threshold) + 1,
		0,
	);
	return (
		<section className="mt-6 px-4" data-testid="speed-milestones">
			<div className="mb-3 flex items-baseline justify-between">
				<h3 className="font-semibold text-sm">Milestones</h3>
				<span className="text-muted-foreground text-xs tabular-nums">
					{reachedTiers} of {TOTAL_TIERS}
				</span>
			</div>
			{data.reached.length > 0 && <MedalGrid reached={data.reached} />}
			{data.next.length > 0 && (
				<>
					<div className="mt-5 mb-3 text-[11px] text-muted-foreground uppercase tracking-wider">
						Next
					</div>
					<MedalGrid next={data.next} />
				</>
			)}
		</section>
	);
}
