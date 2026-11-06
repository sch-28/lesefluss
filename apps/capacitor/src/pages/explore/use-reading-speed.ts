import { bookPace, isMeasuredPace, type Pace } from "@lesefluss/core";
import { queryHooks } from "../../services/db/hooks";

export type ReadingSpeed = Pace & {
	isMeasured: boolean;
	/** Measurable sittings behind a measured pace. */
	sessionCount: number;
	/** False until the speed model has loaded; `wpm` is the fallback meanwhile. */
	isSettled: boolean;
};

/** The pace Explore's reading times and length filters use: the speed model's, like every other estimate. */
export function useReadingSpeed(): ReadingSpeed {
	const { data, isPending } = queryHooks.useStatsSpeedModel();
	const pace = bookPace(data, null);
	return {
		...pace,
		isMeasured: isMeasuredPace(pace),
		sessionCount: data?.sittings ?? 0,
		isSettled: !isPending,
	};
}
