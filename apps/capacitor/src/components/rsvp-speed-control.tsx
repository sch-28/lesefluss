import { Stepper } from "@lesefluss/ui/stepper";
import { cn } from "@lesefluss/ui/utils";
import { RSVP_WPM_RANGE, steppedWpm, type WpmRange } from "../pages/reader/wpm";

/** The one RSVP speed control, shared by every place that sets the RSVP speed. */
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
	return (
		<Stepper
			label="Speed"
			className={cn(compact && "border-0 [&>button]:size-8 [&>button]:text-sm", className)}
			valueClassName="min-w-[7ch] font-normal"
			canDecrement={wpm > range.min}
			canIncrement={wpm < range.max}
			onDecrement={() => onChange(steppedWpm(wpm, range, -1))}
			onIncrement={() => onChange(steppedWpm(wpm, range, 1))}
			value={
				<>
					<span className="font-semibold" data-testid="rsvp-wpm-value">
						{wpm}
					</span>{" "}
					<span className="text-xs opacity-70">wpm</span>
				</>
			}
		/>
	);
}
