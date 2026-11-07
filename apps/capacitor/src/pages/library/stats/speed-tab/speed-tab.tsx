import { SPEED_WINDOWS, type SpeedModel, type SpeedWindow } from "@lesefluss/core";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@lesefluss/ui/dropdown-menu";
import { cn } from "@lesefluss/ui/utils";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { useState } from "react";
import { WINDOW_LABELS } from "../../../../components/speed-chip/speed-chip-model";
import { queryHooks } from "../../../../services/db/hooks";
import {
	deltaLabel,
	type SpeedView,
	speedViews,
	trendDelta,
} from "../../../../services/stats/speed-tab";
import { formatShortDate } from "../../../../utils/date-utils";
import { WpmTrend } from "../wpm-trend";
import { BookSpeedList } from "./book-speed-list";
import { MilestonesSection } from "./milestones-section";
import { RsvpDial } from "./rsvp-dial";
import { ShareSpeedButton } from "./share-speed-button";
import { ReadingInsights, ReadingRecords, RsvpInsights, RsvpRecords } from "./speed-insights";
import { SpeedTestCard } from "./speed-test-card";

const VIEW_LABELS: Record<SpeedView, string> = { reading: "Reading", rsvp: "RSVP" };
const VIEW_DOT: Record<SpeedView, string> = { reading: "bg-slate-500", rsvp: "bg-primary" };

function WindowControl({ window }: { window: SpeedWindow }) {
	const save = queryHooks.useSaveSettings();
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					data-testid="speed-window"
					className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-sm hover:bg-muted"
				>
					{WINDOW_LABELS[window]} <ChevronDown className="size-3.5" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				{SPEED_WINDOWS.map((w) => (
					<DropdownMenuItem
						key={w}
						onSelect={() => {
							if (w !== window) save.mutate({ speedWindow: w });
						}}
					>
						<Check className={cn("size-4", w === window ? "opacity-100" : "opacity-0")} />
						{WINDOW_LABELS[w]}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function viewWpm(model: SpeedModel, view: SpeedView): number {
	return view === "rsvp" ? (model.rsvp?.wpm ?? 0) : model.reading.wpm;
}

function ModeSwitch({
	model,
	views,
	value,
	onChange,
}: {
	model: SpeedModel;
	views: SpeedView[];
	value: SpeedView;
	onChange: (view: SpeedView) => void;
}) {
	return (
		<div className="mb-5 grid grid-cols-2 gap-2 px-4" data-testid="speed-mode">
			{views.map((view) => (
				<button
					key={view}
					type="button"
					aria-pressed={view === value}
					onClick={() => onChange(view)}
					className={cn(
						"flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm",
						view === value ? "border-foreground/40 bg-muted" : "border-border",
					)}
				>
					<span className={cn("size-2 rounded-full", VIEW_DOT[view])} aria-hidden="true" />
					<span className="flex-1">{VIEW_LABELS[view]}</span>
					<span className="font-semibold tabular-nums">{viewWpm(model, view)}</span>
				</button>
			))}
		</div>
	);
}

function Hero({ model, view, now }: { model: SpeedModel; view: SpeedView; now: number }) {
	const trend = queryHooks.useStatsWpmTrend(model.window, view, now);
	const delta = trend.data ? trendDelta(trend.data) : null;
	const { scroll, page } = model.reading;
	let sub: string | undefined;
	if (view === "reading") {
		if (model.reading.source === "default") sub = "Average reader";
		else if (model.reading.source === "test") sub = "Speed test";
		else if (scroll && page) sub = `Scroll ${scroll.wpm} · Page ${page.wpm}`;
	}
	return (
		<div className="mb-4 px-4" data-testid="speed-hero">
			<div className="text-[11px] text-muted-foreground uppercase tracking-wider">
				{view === "rsvp" ? "RSVP speed" : "Reading speed"}
			</div>
			<div className="mt-1 flex items-baseline gap-2">
				<span className="font-bold text-2xl tabular-nums leading-none">{viewWpm(model, view)}</span>
				<span className="text-muted-foreground text-sm">wpm</span>
				{delta && (
					<span
						className={cn(
							"ml-auto text-sm tabular-nums",
							delta.wpm > 0 ? "text-emerald-600" : delta.wpm < 0 ? "text-red-600" : "",
						)}
					>
						{deltaLabel(model.window, delta.wpm, formatShortDate(delta.since))}
					</span>
				)}
			</div>
			{sub && <div className="mt-1 text-muted-foreground text-xs tabular-nums">{sub}</div>}
		</div>
	);
}

export function SpeedTab({ now }: { now: number }) {
	const modelQuery = queryHooks.useStatsSpeedModel();
	const settings = queryHooks.useSettings();
	const [picked, setPicked] = useState<SpeedView | null>(null);
	const model = modelQuery.data;

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

	return (
		<div className="pt-2 pb-6" data-testid="speed-tab">
			<div className="mb-4 flex items-center justify-between px-4">
				<h2 className="font-semibold text-lg">Speed</h2>
				<div className="flex items-center gap-1">
					<ShareSpeedButton model={model} view={view} now={now} />
					<WindowControl window={model.window} />
				</div>
			</div>
			{views.length > 1 && (
				<ModeSwitch model={model} views={views} value={view} onChange={setPicked} />
			)}
			<Hero model={model} view={view} now={now} />
			<WpmTrend
				window={model.window}
				mode={view}
				windowLabel={WINDOW_LABELS[model.window]}
				now={now}
			/>
			<SpeedTestCard />
			{view === "rsvp" && model.rsvp ? (
				<>
					<RsvpDial model={model} />
					<RsvpInsights model={model} />
					<RsvpRecords />
				</>
			) : (
				<>
					<ReadingInsights />
					<ReadingRecords />
				</>
			)}
			<MilestonesSection />
			<BookSpeedList model={model} />
		</div>
	);
}
