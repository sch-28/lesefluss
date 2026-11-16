import type { SpeedModel } from "@lesefluss/core";
import { queryHooks } from "../../../../services/db/hooks";
import { type SpeedView, speedDelta } from "../../../../services/stats/speed-tab";
import { firstShownBucket } from "../wpm-trend";

/**
 * The headline speed against the speed as it stood at the end of the trend chart's
 * first bucket, so the badge covers the same range as the chart beneath it. The end,
 * not the start: on a window that holds the reader's whole history nothing came
 * before the chart, and the badge would never show.
 */
export function useTrendDelta(
	model: SpeedModel,
	view: SpeedView,
	now: number,
): { delta: number | null; since: number | null } {
	const trend = queryHooks.useStatsWpmTrend(model.window, view, now);
	const measured = trend.data?.measured ?? [];
	const first = trend.data ? firstShownBucket(measured, trend.data.tests) : 0;
	const since = measured[first]?.bucketStart ?? null;
	const firstBucketEnd = measured[first + 1]?.bucketStart ?? null;
	const earlier = queryHooks.useStatsSpeedModelEarlier(firstBucketEnd);
	return {
		delta: firstBucketEnd === null ? null : speedDelta(model, earlier.data, view),
		since,
	};
}
