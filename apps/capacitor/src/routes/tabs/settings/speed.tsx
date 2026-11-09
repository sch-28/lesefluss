import { bookPace, DEFAULT_SETTINGS, SPEED_WINDOWS, type SpeedWindow } from "@lesefluss/core";
import { RadioGroup, RadioGroupItem } from "@lesefluss/ui/radio-group";
import { createFileRoute } from "@tanstack/react-router";
import { Gauge } from "lucide-react";
import { PageHeader } from "@/components/app-shell/page-header";
import { ReservedCard } from "@/components/reserved-card";
import { SettingsSection } from "@/components/settings/settings-section";
import { WINDOW_LABELS } from "@/components/speed-chip/speed-chip-model";
import { useContinueReading } from "@/hooks/use-continue-reading";
import { queryHooks } from "@/services/db/hooks";
import { formatDuration } from "@/utils/date-utils";
import { estimateMinutesLeft, formatReadingTime } from "@/utils/reading-time";

export const Route = createFileRoute("/tabs/settings/speed")({
	component: SpeedSettings,
});

const WINDOW_HINTS: Record<SpeedWindow, string> = {
	recent: "Your latest sittings. Follows today's form.",
	"30d": "A steadier average over the past month.",
	all: "Every sitting since you started.",
};

const PREVIEW_HEIGHT = 132;

function SpeedSettings() {
	const settings = queryHooks.useSettings();
	const save = queryHooks.useSaveSettings();
	// The radio follows the tap at once; the setting itself lands after the write.
	const window: SpeedWindow =
		(save.isPending ? save.variables?.speedWindow : undefined) ??
		settings.data?.speedWindow ??
		DEFAULT_SETTINGS.SPEED_WINDOW;

	return (
		<div className="bg-background">
			<PageHeader title="Speed & estimates" icon={Gauge} />
			<div className="mx-auto max-w-2xl px-4 pt-4 pb-10">
				<SettingsSection title="Window">
					<RadioGroup
						aria-label="Speed window"
						value={window}
						onValueChange={(next) => {
							if (next !== window) save.mutate({ speedWindow: next as SpeedWindow });
						}}
						className="gap-0 divide-y divide-border"
						data-testid="speed-window-options"
					>
						{SPEED_WINDOWS.map((w) => (
							<label
								key={w}
								htmlFor={`speed-window-${w}`}
								className="flex min-h-14 cursor-pointer items-center gap-3 px-4 py-2"
							>
								<RadioGroupItem id={`speed-window-${w}`} value={w} className="size-5" />
								<span className="min-w-0 flex-1">
									<span className="block text-foreground text-sm">{WINDOW_LABELS[w]}</span>
									<span className="block text-muted-foreground text-xs">{WINDOW_HINTS[w]}</span>
								</span>
							</label>
						))}
					</RadioGroup>
				</SettingsSection>
				<p className="m-0 mt-2 px-4 text-muted-foreground text-xs">
					Your speed and every time estimate in the app use the sittings from this span.
				</p>
				<div className="mt-3 px-4">
					<SpeedPreview />
				</div>
			</div>
		</div>
	);
}

function SpeedPreview() {
	const model = queryHooks.useStatsSpeedModel();
	const continueReading = useContinueReading();
	const book = continueReading?.book;
	const data = model.data;
	const minutesLeft = book && data ? estimateMinutesLeft(book, bookPace(data, book.id).wpm) : null;
	return (
		<ReservedCard isPending={!data} height={PREVIEW_HEIGHT}>
			{data && (
				<div
					className="flex flex-col gap-2 rounded-[14px] border border-border bg-card p-4"
					data-testid="speed-preview"
				>
					<div className="text-[0.8125rem] text-muted-foreground">Preview with this window</div>
					<div className="font-semibold text-2xl tabular-nums">{data.reading.wpm} wpm</div>
					{book && minutesLeft !== null && (
						<div className="flex justify-between gap-3 text-sm">
							<span className="min-w-0 truncate">{book.title}</span>
							<b className="shrink-0 font-medium tabular-nums">
								{formatReadingTime(minutesLeft)} left
							</b>
						</div>
					)}
					<div className="flex justify-between gap-3 text-muted-foreground text-sm">
						<span>Based on</span>
						<b className="font-medium tabular-nums">
							{data.reading.source === "default"
								? "the average reader"
								: data.reading.source === "test"
									? "your speed test"
									: `${formatDuration(data.reading.activeMs)} of reading`}
						</b>
					</div>
				</div>
			)}
		</ReservedCard>
	);
}
