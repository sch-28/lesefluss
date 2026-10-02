import { queryHooks } from "../../services/db/hooks";

const DEFAULT_WPM = 350;

/** The speed reading-time estimates use: the reader's RSVP setting. */
export function useReaderWpm(): number {
	const { data } = queryHooks.useSettings();
	return data?.wpm && data.wpm > 0 ? data.wpm : DEFAULT_WPM;
}
