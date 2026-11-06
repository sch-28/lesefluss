import type { SpeedWindow } from "@lesefluss/core";
import { useQuery } from "@tanstack/react-query";
import { startOfLocalDay } from "../../../utils/date-utils";
import type { TrendPeriod } from "../../stats/aggregate";
import { queries } from "../queries";
import { statsKeys } from "./query-keys";

function usePeriodTotals(start: number, end: number, enabled = true) {
	return useQuery({
		queryKey: statsKeys.periodTotals(start, end),
		queryFn: () => queries.getPeriodTotals(start, end),
		enabled,
	});
}

function useClosedPeriodTotals(start: number, end: number, enabled = true) {
	return useQuery({
		queryKey: statsKeys.closedPeriodTotals(start, end),
		queryFn: () => queries.getPeriodTotals(start, end),
		enabled,
	});
}

function useStreak() {
	return useQuery({
		queryKey: statsKeys.streak,
		queryFn: () => queries.getStreak(),
	});
}

function useTopBooks(since: number, limit = 5) {
	return useQuery({
		queryKey: statsKeys.topBooks(since, limit),
		queryFn: () => queries.getTopBooks({ since, limit }),
	});
}

function useWpmTrend(period: TrendPeriod, now: number) {
	return useQuery({
		queryKey: statsKeys.wpmTrend(period, startOfLocalDay(now)),
		queryFn: () => queries.getWpmTrend({ period, now }),
	});
}

/** The window stays `recent` until the Speed tab lets the reader pick one (LESE-124.4). */
function useSpeedModel(window: SpeedWindow = "recent") {
	return useQuery({
		queryKey: statsKeys.speedModel(window),
		// `now` only matters for the 30-day window, and a stats invalidation refetches it.
		queryFn: () => queries.getSpeedModel({ window, now: Date.now() }),
	});
}

function useHourHistogram() {
	return useQuery({
		queryKey: statsKeys.hourHistogram,
		queryFn: () => queries.getHourHistogram(),
	});
}

function useBookStats(bookId: string) {
	return useQuery({
		queryKey: statsKeys.book(bookId),
		queryFn: () => queries.getBookStats(bookId),
		enabled: !!bookId,
	});
}

function useCurrentlyReading() {
	return useQuery({
		queryKey: statsKeys.currentlyReading,
		queryFn: () => queries.getCurrentlyReading(),
	});
}

function useFinishedBooks() {
	return useQuery({
		queryKey: statsKeys.finishedBooks,
		queryFn: () => queries.getFinishedBooks(),
	});
}

function useReadingRecords() {
	return useQuery({
		queryKey: statsKeys.records,
		queryFn: () => queries.getReadingRecords(),
	});
}

function useDailyReading() {
	return useQuery({
		queryKey: statsKeys.daily,
		queryFn: () => queries.getDailyReading(),
	});
}

export const statsHooks = {
	useDailyReading,
	useReadingRecords,
	useCurrentlyReading,
	useFinishedBooks,
	usePeriodTotals,
	useClosedPeriodTotals,
	useStreak,
	useTopBooks,
	useWpmTrend,
	useHourHistogram,
	useSpeedModel,
	useBookStats,
};
