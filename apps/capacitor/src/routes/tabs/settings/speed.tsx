import { bookPace, DEFAULT_SETTINGS, SPEED_WINDOWS, type SpeedWindow } from "@lesefluss/core";
import { RadioGroup, RadioGroupItem } from "@lesefluss/ui/radio-group";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Gauge } from "lucide-react";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/page-container";
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

/** Must match the loaded card, without and with its book row. */
const PREVIEW_HEIGHT = "calc(7.5rem + 2px)";
const PREVIEW_HEIGHT_WITH_BOOK = "calc(9.25rem + 2px)";

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
			<PageContainer width="text" className="px-4 pt-4 pb-10">
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
			</PageContainer>
		</div>
	);
}

function SpeedPreview() {
	const model = queryHooks.useStatsSpeedModel();
	// The same queries useContinueReading reads, asked here too so the card waits
	// for the book row rather than growing by it once the book lands.
	const lastReadId = queryHooks.useLastReadBookId();
	const lastRead = queryHooks.useBook(lastReadId.data ?? "");
	const continueReading = useContinueReading();
	const book = continueReading?.book;
	const data = model.data;
	const isPending = !data || lastReadId.isPending || (!!lastReadId.data && lastRead.isPending);
	const minutesLeft = book && data ? estimateMinutesLeft(book, bookPace(data, book.id).wpm) : null;
	return (
		<ReservedCard
			isPending={isPending}
			height={lastReadId.data ? PREVIEW_HEIGHT_WITH_BOOK : PREVIEW_HEIGHT}
		>
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
					{data.reading.source === "default" ? (
						<div className="flex justify-between gap-3 text-muted-foreground text-sm">
							<span>Based on the average reader</span>
							<Link
								to="/speed-test"
								className="font-medium text-primary underline underline-offset-4"
								data-testid="speed-test-link"
							>
								Test my speed
							</Link>
						</div>
					) : (
						<div className="flex justify-between gap-3 text-muted-foreground text-sm">
							<span>Based on</span>
							<b className="font-medium tabular-nums">
								{data.reading.source === "test"
									? "your speed test"
									: `${formatDuration(data.reading.activeMs)} of reading`}
							</b>
						</div>
					)}
				</div>
			)}
		</ReservedCard>
	);
}
