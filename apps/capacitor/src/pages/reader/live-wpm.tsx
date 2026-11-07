import { DEFAULT_SETTINGS } from "@lesefluss/core";
import { useEffect, useState } from "react";
import type { Settings } from "../../services/db/schema";
import { POLL_MS, type ReadingSessionMode } from "./session-tracker";

/** RSVP has its own dial and listening its own speed, so the chip is for the eyes-on-text modes only. */
export function isLiveWpmShown(
	isSettingOn: boolean,
	mode: ReadingSessionMode,
	isListening: boolean,
): boolean {
	return isSettingOn && mode !== "rsvp" && !isListening;
}

type Props = {
	/** Undefined while the settings load. */
	settings: Pick<Settings, "showLiveWpm"> | undefined;
	mode: ReadingSessionMode;
	isListening: boolean;
	getRate: () => number | null;
};

/** The sitting's live wpm for the progress label, when the setting and the mode allow it. */
export function LiveWpm({
	settings,
	mode,
	isListening,
	getRate,
}: Props): React.ReactElement | null {
	const isSettingOn = settings?.showLiveWpm ?? DEFAULT_SETTINGS.SHOW_LIVE_WPM;
	if (!isLiveWpmShown(isSettingOn, mode, isListening)) return null;
	return <LiveRate getRate={getRate} />;
}

/** Renders nothing until the rate means something. */
function LiveRate({ getRate }: { getRate: () => number | null }): React.ReactElement | null {
	const [rate, setRate] = useState(getRate);

	useEffect(() => {
		setRate(getRate());
		const interval = setInterval(() => setRate(getRate()), POLL_MS);
		return () => clearInterval(interval);
	}, [getRate]);

	if (rate === null) return null;
	return (
		<>
			{" · "}
			<span className="reader-progress-live-wpm">{rate} wpm</span>
		</>
	);
}
