import { DEFAULT_SETTINGS, type SpeedWindow } from "@lesefluss/core";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { startOfLocalDay } from "../../../utils/date-utils";
import { queries } from "../queries";
import type { SpeedTrendMode } from "../queries/stats";
import { statsKeys } from "./query-keys";
import { settingsHooks } from "./use-settings";

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

function useWpmTrend(window: SpeedWindow, mode: SpeedTrendMode, now: number) {
	return useQuery({
		queryKey: statsKeys.wpmTrend(window, mode, startOfLocalDay(now)),
		queryFn: () => queries.getWpmTrend({ window, mode, now }),
	});
}

/** Every surface reads the window the reader picked on the Speed tab, so no two disagree. */
function useSpeedModel() {
	const settings = settingsHooks.useSettings();
	const window: SpeedWindow = settings.data?.speedWindow ?? DEFAULT_SETTINGS.SPEED_WINDOW;
	return useQuery({
		queryKey: statsKeys.speedModel(window),
		// `now` only matters for the 30-day window, and a stats invalidation refetches it.
		queryFn: () => queries.getSpeedModel({ window, now: Date.now() }),
		// Waiting for the setting saves a cold start one scan under the wrong window.
		enabled: settings.data !== undefined,
		placeholderData: keepPreviousData,
	});
}

/** The model as it stood before these sittings, so a sitting isn't compared with itself. */
function useSpeedModelWithout(sessionIds: readonly string[]) {
	const settings = settingsHooks.useSettings();
	const window: SpeedWindow = settings.data?.speedWindow ?? DEFAULT_SETTINGS.SPEED_WINDOW;
	return useQuery({
		queryKey: statsKeys.speedModelWithout(window, sessionIds),
		queryFn: () => queries.getSpeedModel({ window, now: Date.now(), without: sessionIds }),
		enabled: settings.data !== undefined,
	});
}

function useSpeedTab() {
	return useQuery({ queryKey: statsKeys.speedTab, queryFn: () => queries.getSpeedTab() });
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
	useSpeedModelWithout,
	useSpeedTab,
	useBookStats,
};
