import { Button } from "@lesefluss/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { Gauge } from "lucide-react";
import { queryHooks } from "../../../../services/db/hooks";
import { formatShortDate } from "../../../../utils/date-utils";

export function SpeedTestCard() {
	const navigate = useNavigate();
	const latest = queryHooks.useSpeedTests().data?.[0];
	return (
		<div
			className="mx-4 mb-8 flex items-center gap-3 rounded-lg border border-border p-3"
			data-testid="speed-test-card"
		>
			<Gauge className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
			<div className="min-w-0 flex-1">
				<div className="font-medium text-sm">Speed test</div>
				<div className="text-muted-foreground text-xs tabular-nums">
					{latest
						? `${formatShortDate(latest.createdAt)} · ${latest.readingWpm} wpm`
						: "Not taken yet"}
				</div>
			</div>
			<Button size="sm" variant="outline" onClick={() => void navigate({ to: "/speed-test" })}>
				Test my speed
			</Button>
		</div>
	);
}
