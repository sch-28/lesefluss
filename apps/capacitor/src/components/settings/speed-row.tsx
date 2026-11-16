import { RSVP_WPM_RANGE, type WpmRange } from "../../pages/reader/wpm";
import { RsvpSpeedControl } from "../rsvp-speed-control";
import { RowLabel, SettingsRow } from "./settings-row";

/** The one speed row of every settings page (RSVP, Listen), so a speed is set the same way everywhere. */
export function SpeedRow({
	label,
	wpm,
	onChange,
	range = RSVP_WPM_RANGE,
}: {
	label: string;
	wpm: number;
	onChange: (wpm: number) => void;
	range?: WpmRange;
}) {
	return (
		<SettingsRow>
			<RowLabel title={label} />
			<div data-testid="speed-row" className="ml-auto">
				<RsvpSpeedControl wpm={wpm} onChange={onChange} range={range} />
			</div>
		</SettingsRow>
	);
}
