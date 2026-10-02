import { queryHooks } from "../../services/db/hooks";
import { type ReadingPace, readingPace } from "../../utils/reading-time";

export type ReadingSpeed = ReadingPace & {
	sessionCount: number;
	/** False until the measured speed has loaded; `wpm` is the fallback meanwhile. */
	isSettled: boolean;
};

/** The pace Explore's reading times and length filters use, by the same rule as library stats. */
export function useReadingSpeed(): ReadingSpeed {
	const { data, isPending } = queryHooks.useStatsMeasuredSpeed();
	return {
		...readingPace(data?.wpm),
		sessionCount: data?.sessionCount ?? 0,
		isSettled: !isPending,
	};
}
