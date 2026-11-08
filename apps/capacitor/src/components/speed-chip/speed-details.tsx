import {
	BOOK_SPEED_MIN_ACTIVE_MS,
	bookPace,
	estimateMinutes,
	modeSpeed,
	type SpeedModel,
} from "@lesefluss/core";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { RSVP_WPM_RANGE, steppedWpm } from "../../pages/reader/wpm";
import { queryHooks } from "../../services/db/hooks";
import { deltaLabel, type SpeedView, speedViews, trendDelta } from "../../services/stats/speed-tab";
import { formatDuration, formatShortDate } from "../../utils/date-utils";
import { formatReadingTime } from "../../utils/reading-time";
import { Sparkline } from "../sparkline";
import { WINDOW_LABELS } from "./speed-chip-model";

export type SpeedChipBook = { id: string; wordsLeft: number | null };

type Props = {
	model: SpeedModel;
	dialWpm: number;
	showDial: boolean;
	/** The mode the big number shows, from the default reader mode. */
	primary: SpeedView;
	book?: SpeedChipBook;
	onNavigate: () => void;
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
	return (
		<div className="flex items-baseline justify-between gap-3 text-sm">
			<span className="text-muted-foreground">{label}</span>
			<span className="font-medium tabular-nums">{value}</span>
		</div>
	);
}

const VIEW_LABELS: Record<SpeedView, string> = { reading: "Reading", rsvp: "RSVP" };

/** One mode's speed with its trend over the window; the delta is neutral, slower isn't a failure. */
function ModeRow({
	model,
	view,
	sub,
	now,
}: {
	model: SpeedModel;
	view: SpeedView;
	sub?: string;
	now: number;
}) {
	const trend = queryHooks.useStatsWpmTrend(model.window, view, now);
	const points = trend.data?.measured.filter((p) => p.avgWpm > 0).map((p) => p.avgWpm) ?? [];
	const delta = trend.data ? trendDelta(trend.data) : null;
	const wpm = view === "rsvp" ? (model.rsvp?.wpm ?? 0) : model.reading.wpm;
	return (
		<div
			className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-x-3"
			data-testid={`speed-row-${view}`}
		>
			<span className="flex flex-col">
				<span className="text-sm">{VIEW_LABELS[view]}</span>
				{sub && <span className="text-[0.6875rem] text-muted-foreground tabular-nums">{sub}</span>}
			</span>
			<Sparkline points={points} />
			<span className="flex flex-col items-end">
				<span className="font-semibold text-sm tabular-nums">{wpm} wpm</span>
				{delta && (
					<span className="text-[0.6875rem] text-muted-foreground tabular-nums">
						{deltaLabel(model.window, delta.wpm, formatShortDate(delta.since))}
					</span>
				)}
			</span>
		</div>
	);
}

const SOURCE_SUB = { measured: undefined, test: "Speed test", default: "Default" } as const;

function DialStepper({ dial, onStep }: { dial: number; onStep: (direction: 1 | -1) => void }) {
	return (
		<div className="flex items-center justify-between gap-3">
			<div className="flex flex-col">
				<span className="text-sm">Default dial</span>
				<span className="text-[0.6875rem] text-muted-foreground">Global, all books</span>
			</div>
			<div className="flex items-center gap-1">
				<button
					type="button"
					aria-label={`Dial −${RSVP_WPM_RANGE.step}`}
					disabled={dial <= RSVP_WPM_RANGE.min}
					onClick={() => onStep(-1)}
					className="inline-flex size-8 items-center justify-center rounded-md border border-border hover:bg-muted disabled:opacity-40"
				>
					<Minus className="size-4" />
				</button>
				<span
					data-testid="speed-dial"
					className="w-12 text-center font-semibold text-sm tabular-nums"
				>
					{dial}
				</span>
				<button
					type="button"
					aria-label={`Dial +${RSVP_WPM_RANGE.step}`}
					disabled={dial >= RSVP_WPM_RANGE.max}
					onClick={() => onStep(1)}
					className="inline-flex size-8 items-center justify-center rounded-md border border-border hover:bg-muted disabled:opacity-40"
				>
					<Plus className="size-4" />
				</button>
			</div>
		</div>
	);
}

function footnote(model: SpeedModel, showDial: boolean): string {
	if (model.pace.source === "measured") {
		const activeMs = model.reading.activeMs + (model.rsvp?.activeMs ?? 0);
		const from = `Estimated from ${formatDuration(activeMs)} of reading.`;
		if (!showDial) return `${from} Time estimates use your pace.`;
		return `${from} Time estimates use your pace, the mix of both modes; RSVP times use the dial and what your RSVP sittings delivered.`;
	}
	if (model.pace.source === "test") {
		return "From your speed test until you have read for 10 minutes.";
	}
	return "An average reader's speed until you have read for 10 minutes.";
}

export function SpeedDetails({ model, dialWpm, showDial, primary, book, onNavigate }: Props) {
	const [now] = useState(Date.now);
	const views = speedViews(model);
	const { scroll, page } = model.reading;
	const split = scroll && page ? `Scroll ${scroll.wpm} · Page ${page.wpm}` : undefined;
	const lead = views.includes(primary) ? primary : (views[0] ?? "reading");
	const leadWpm = lead === "rsvp" ? (model.rsvp?.wpm ?? 0) : model.reading.wpm;
	const save = queryHooks.useSaveSettings();
	// Local so quick taps step from the last tap and the estimates follow at
	// once, not after the save has been re-read.
	const [dial, setDial] = useState(dialWpm);
	useEffect(() => setDial(dialWpm), [dialWpm]);
	const stepDial = (direction: 1 | -1) => {
		const next = steppedWpm(dial, RSVP_WPM_RANGE, direction);
		if (next === dial) return;
		setDial(next);
		save.mutate({ wpm: next });
	};
	const rsvpAtDial = modeSpeed(model, "rsvp", dial);
	const ownBook = book ? model.books[book.id] : undefined;
	const pace = bookPace(model, book?.id);

	return (
		<div className="flex flex-col gap-3" data-testid="speed-details">
			<div className="flex items-baseline justify-between">
				<span className="font-semibold text-[0.6875rem] text-muted-foreground uppercase tracking-wider">
					Your speed
				</span>
				<span className="text-[0.6875rem] text-muted-foreground">
					{WINDOW_LABELS[model.window]}
				</span>
			</div>

			<div className="flex items-baseline gap-1.5" data-testid="speed-big">
				<span className="font-bold text-3xl tabular-nums leading-none">{leadWpm}</span>
				<span className="text-muted-foreground text-sm">
					wpm{views.length > 1 ? ` ${VIEW_LABELS[lead]}` : ""}
				</span>
			</div>

			<div className="flex flex-col gap-2">
				{views.map((view) => (
					<ModeRow
						key={view}
						model={model}
						view={view}
						now={now}
						sub={
							view === "reading"
								? (SOURCE_SUB[model.reading.source] ?? split)
								: model.rsvp?.dialWpm != null
									? `Avg dial ${model.rsvp.dialWpm}`
									: undefined
						}
					/>
				))}
			</div>

			{showDial && <DialStepper dial={dial} onStep={stepDial} />}

			<div className="flex flex-col gap-1.5 border-border border-t pt-3 empty:hidden">
				{showDial && <Row label="RSVP at dial" value={`${rsvpAtDial} wpm`} />}
				{ownBook && ownBook.activeMs >= BOOK_SPEED_MIN_ACTIVE_MS && (
					<Row
						label="This book"
						value={`${formatDuration(ownBook.activeMs)} · ${ownBook.wpm} wpm`}
					/>
				)}
				{book && book.wordsLeft !== null && book.wordsLeft > 0 && (
					<>
						<Row
							label="Time left"
							value={formatReadingTime(estimateMinutes(book.wordsLeft, pace.wpm))}
						/>
						{showDial && (
							<Row
								label="Time left RSVP"
								value={formatReadingTime(estimateMinutes(book.wordsLeft, rsvpAtDial))}
							/>
						)}
					</>
				)}
			</div>

			<p className="m-0 text-[0.6875rem] text-muted-foreground leading-snug">
				{footnote(model, showDial)}
			</p>

			<Link
				to="/tabs/stats"
				search={{ tab: "speed" }}
				onClick={onNavigate}
				className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 font-medium text-sm hover:bg-muted"
			>
				Speed details <ArrowRight className="size-4" />
			</Link>
		</div>
	);
}
