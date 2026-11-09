import type { SpeedModel, SpeedWindow } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { SegmentedControl } from "@lesefluss/ui/segmented-control";
import { cn } from "@lesefluss/ui/utils";
import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { WINDOW_LABELS } from "../../../../components/speed-chip/speed-chip-model";
import { queryHooks } from "../../../../services/db/hooks";
import {
	deltaLabel,
	type SpeedView,
	speedDelta,
	speedViews,
	viewWpm,
} from "../../../../services/stats/speed-tab";
import { WpmTrend } from "../wpm-trend";
import { BookSpeedList } from "./book-speed-list";
import { MilestonesSection } from "./milestones-section";
import { RsvpDial } from "./rsvp-dial";
import { ShareSpeedButton } from "./share-speed-button";
import { PersonalBests, SpeedInsights } from "./speed-insights";

const VIEW_LABELS: Record<SpeedView, string> = { reading: "Reading", rsvp: "RSVP" };

const WINDOW_PHRASES: Record<SpeedWindow, string> = {
	recent: "your last 10 hours",
	"30d": "the last 30 days",
	all: "all your reading",
};

/** Whether the view has a speed of its own yet; the reading default is the average reader's. */
export function hasOwnSpeed(model: SpeedModel, view: SpeedView): boolean {
	return view === "rsvp" ? model.rsvp !== null : model.reading.source !== "default";
}

function Headline({ model, view }: { model: SpeedModel; view: SpeedView }) {
	const wpm = viewWpm(model, view);
	const earlier = queryHooks.useStatsSpeedModelEarlier();
	const delta = speedDelta(model, earlier.data, view);
	const basis =
		view === "reading" && model.reading.source === "test"
			? "From your speed test"
			: `Based on ${WINDOW_PHRASES[model.window]}`;
	return (
		<div data-testid="speed-hero">
			<div className="flex items-baseline gap-2">
				<span className="font-bold text-[2.25rem] tabular-nums leading-none tracking-tight">
					{wpm}
				</span>
				<span className="text-muted-foreground">wpm</span>
				{delta !== null && (
					<span className="ml-auto text-[0.8125rem] tabular-nums">
						{/* A rise is good news; a drop stays neutral, slower isn't a failure. */}
						<span className={cn(delta > 0 ? "text-[var(--goal-met)]" : "text-muted-foreground")}>
							{deltaLabel(delta)}
						</span>
					</span>
				)}
			</div>
			<div className="mt-1 text-[0.8125rem] text-muted-foreground">
				{basis} ·{" "}
				<Link
					to="/tabs/settings/speed"
					data-testid="speed-window"
					aria-label={`Change the speed window, now ${WINDOW_LABELS[model.window]}`}
					className="font-medium text-primary no-underline"
				>
					change
				</Link>
			</div>
		</div>
	);
}

function ViewRow({
	model,
	views,
	view,
	onChange,
	now,
}: {
	model: SpeedModel;
	views: SpeedView[];
	view: SpeedView;
	onChange: (view: SpeedView) => void;
	now: number;
}) {
	const canShare = views.some((v) => hasOwnSpeed(model, v));
	if (views.length < 2 && !canShare) return null;
	return (
		<div className="mt-2 flex items-center gap-2">
			{views.length > 1 && (
				<SegmentedControl
					aria-label="Speed mode"
					data-testid="speed-mode"
					className="flex-1"
					value={view}
					onValueChange={onChange}
					options={views.map((v) => ({ value: v, label: VIEW_LABELS[v] }))}
				/>
			)}
			{canShare && <ShareSpeedButton model={model} view={view} now={now} />}
		</div>
	);
}

export function SpeedTab({ now }: { now: number }) {
	const modelQuery = queryHooks.useStatsSpeedModel();
	const settings = queryHooks.useSettings();
	const [picked, setPicked] = useState<SpeedView | null>(null);
	const model = modelQuery.data;

	if (!model && modelQuery.isError) {
		return (
			<div
				className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-4 text-center"
				role="alert"
				data-testid="speed-error"
			>
				<p className="m-0 text-muted-foreground text-sm">Your speed couldn't be worked out.</p>
				<Button
					variant="outline"
					size="sm"
					disabled={modelQuery.isFetching}
					onClick={() => void modelQuery.refetch()}
				>
					Try again
				</Button>
			</div>
		);
	}

	if (!model) {
		return (
			<div className="flex min-h-[40vh] items-center justify-center">
				<Loader2 className="size-6 animate-spin text-muted-foreground" />
			</div>
		);
	}

	const views = speedViews(model);
	const preferred: SpeedView = settings.data?.defaultReaderMode === "rsvp" ? "rsvp" : "reading";
	const view =
		picked && views.includes(picked)
			? picked
			: views.includes(preferred)
				? preferred
				: (views[0] ?? "reading");
	const hasSpeed = hasOwnSpeed(model, view);

	return (
		<div className="pb-6" data-testid="speed-tab">
			<section className="mt-4 px-4">
				{hasSpeed && (
					<>
						<Headline model={model} view={view} />
						<div className="mt-4">
							<WpmTrend
								window={model.window}
								mode={view}
								windowLabel={WINDOW_LABELS[model.window]}
								now={now}
							/>
						</div>
					</>
				)}
				<ViewRow model={model} views={views} view={view} onChange={setPicked} now={now} />
			</section>
			{view === "rsvp" && model.rsvp && <RsvpDial model={model} />}
			<SpeedInsights model={model} view={view} />
			<PersonalBests />
			<MilestonesSection />
			<BookSpeedList model={model} />
		</div>
	);
}
