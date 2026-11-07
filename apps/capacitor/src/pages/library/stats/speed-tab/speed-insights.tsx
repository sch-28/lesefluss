import type { SpeedModel } from "@lesefluss/core";
import { Popover, PopoverContent, PopoverTrigger } from "@lesefluss/ui/popover";
import { Info } from "lucide-react";
import { queryHooks } from "../../../../services/db/hooks";
import { type SittingRecord, timeSavedMs } from "../../../../services/stats/speed-tab";
import { formatDuration, formatShortDate } from "../../../../utils/date-utils";
import { deliveredPercent } from "./rsvp-dial";

function formatWords(words: number): string {
	if (words >= 1_000_000) return `${(words / 1_000_000).toFixed(1)}M words`;
	if (words >= 1000) return `${Math.round(words / 1000)}k words`;
	return `${words} words`;
}

function InfoPopover({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label={`About ${label}`}
					className="inline-flex text-muted-foreground hover:text-foreground"
				>
					<Info className="size-3.5" />
				</button>
			</PopoverTrigger>
			<PopoverContent className="w-64 text-xs leading-snug">{children}</PopoverContent>
		</Popover>
	);
}

function InsightTile({
	label,
	value,
	sub,
	info,
	testId,
}: {
	label: string;
	value: string;
	sub?: string;
	info?: React.ReactNode;
	testId?: string;
}) {
	return (
		<div
			className="flex flex-col gap-0.5 rounded-lg border border-border bg-muted/40 px-3 py-2"
			data-testid={testId}
		>
			<span className="flex items-center gap-1 text-[11px] text-muted-foreground">
				{label}
				{info && <InfoPopover label={label}>{info}</InfoPopover>}
			</span>
			<span className="font-semibold text-lg tabular-nums leading-tight">{value}</span>
			{sub && <span className="text-[11px] text-muted-foreground tabular-nums">{sub}</span>}
		</div>
	);
}

export function RsvpInsights({ model }: { model: SpeedModel }) {
	const saved = timeSavedMs(model);
	const ratio = model.rsvp?.deliveredRatio ?? null;
	if (saved <= 0 && ratio === null) return null;
	return (
		<section className="mb-8 grid grid-cols-2 gap-2 px-4">
			{saved > 0 && model.rsvp && (
				<InsightTile
					testId="time-saved"
					label="Time saved"
					value={formatDuration(saved)}
					sub={formatWords(model.rsvp.words)}
					info={`Your RSVP words at your reading speed of ${model.reading.wpm} wpm, against the time they took at ${model.rsvp.wpm} wpm.`}
				/>
			)}
			{ratio !== null && (
				<InsightTile
					testId="delivered-of-dial"
					label="Delivered of dial"
					value={`${deliveredPercent(ratio)}%`}
					sub={model.rsvp?.dialWpm != null ? `Dial ${model.rsvp.dialWpm}` : undefined}
					info="Words your RSVP sittings delivered per minute, as a share of the dial they ran at. Punctuation and long words hold some words longer."
				/>
			)}
		</section>
	);
}

function RecordRow({ label, record }: { label: string; record: SittingRecord | null }) {
	if (!record) return null;
	return (
		<div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
			<span className="text-muted-foreground">{label}</span>
			<span className="min-w-0 text-right">
				<span className="font-semibold tabular-nums">{record.wpm} wpm</span>
				<span className="block truncate text-[11px] text-muted-foreground">
					{record.title} · {formatShortDate(record.at)}
				</span>
			</span>
		</div>
	);
}

function RecordsSection({ children }: { children: React.ReactNode }) {
	return (
		<section className="mb-8 px-4" data-testid="speed-records">
			<header className="mb-2 flex items-baseline justify-between">
				<h3 className="font-semibold text-base">Records</h3>
				<span className="text-[11px] text-muted-foreground uppercase tracking-wider">All time</span>
			</header>
			<div className="divide-y divide-border">{children}</div>
		</section>
	);
}

export function ReadingRecords() {
	const { data } = queryHooks.useStatsSpeedTab();
	const records = data?.records;
	if (!records || (!records.fastestSitting && !records.fastestBook)) return null;
	return (
		<RecordsSection>
			<RecordRow label="Fastest sitting" record={records.fastestSitting} />
			{records.fastestBook && (
				<div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
					<span className="text-muted-foreground">Fastest book</span>
					<span className="min-w-0 text-right">
						<span className="font-semibold tabular-nums">{records.fastestBook.wpm} wpm</span>
						<span className="block truncate text-[11px] text-muted-foreground">
							{records.fastestBook.title}
						</span>
					</span>
				</div>
			)}
		</RecordsSection>
	);
}

export function RsvpRecords() {
	const { data } = queryHooks.useStatsSpeedTab();
	const records = data?.records;
	if (!records?.bestRsvpSitting) return null;
	const longest = records.longestRsvpRun;
	return (
		<RecordsSection>
			<RecordRow label="Best sitting" record={records.bestRsvpSitting} />
			{longest && (
				<div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
					<span className="text-muted-foreground">Longest run</span>
					<span className="min-w-0 text-right">
						<span className="font-semibold tabular-nums">{formatDuration(longest.durationMs)}</span>
						<span className="block truncate text-[11px] text-muted-foreground">
							{longest.title} · {formatShortDate(longest.at)}
						</span>
					</span>
				</div>
			)}
		</RecordsSection>
	);
}
