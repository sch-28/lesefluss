import { cn } from "@lesefluss/ui/utils";
import { RSVP_WPM_RANGE, steppedWpm, type WpmRange } from "../pages/reader/wpm";

// The ::before stretches the touch target to 44px without changing the look.
const STEP_BTN =
	"relative inline-flex items-center justify-center rounded-md font-semibold leading-none transition-colors before:absolute before:-inset-1 before:content-[''] hover:bg-current/10 active:bg-current/15 aria-disabled:cursor-not-allowed aria-disabled:opacity-30 aria-disabled:hover:bg-transparent";

/** The one RSVP speed control: Settings › RSVP, the reader's RSVP controls and Quick RSVP. */
export function RsvpSpeedControl({
	wpm,
	onChange,
	range = RSVP_WPM_RANGE,
	compact = false,
	className,
}: {
	wpm: number;
	onChange: (wpm: number) => void;
	/** Listening in RSVP steps the voice's speed, which has its own limits. */
	range?: WpmRange;
	/** Quick RSVP's small window: a slim row. */
	compact?: boolean;
	className?: string;
}) {
	const atMin = wpm <= range.min;
	const atMax = wpm >= range.max;
	const button = cn(STEP_BTN, compact ? "size-6 text-sm" : "size-9 text-lg");
	// aria-disabled, not disabled: a disabled button drops the focus it holds.
	return (
		<div className={cn("inline-flex items-center gap-1.5", className)}>
			<button
				type="button"
				className={button}
				aria-label="Decrease speed"
				aria-disabled={atMin}
				onClick={() => {
					if (!atMin) onChange(steppedWpm(wpm, range, -1));
				}}
			>
				−
			</button>
			<span className="min-w-[7ch] text-center tabular-nums" aria-live="polite">
				<span className="font-semibold" data-testid="rsvp-wpm-value">
					{wpm}
				</span>{" "}
				<span className="text-xs opacity-70">wpm</span>
			</span>
			<button
				type="button"
				className={button}
				aria-label="Increase speed"
				aria-disabled={atMax}
				onClick={() => {
					if (!atMax) onChange(steppedWpm(wpm, range, 1));
				}}
			>
				+
			</button>
		</div>
	);
}
