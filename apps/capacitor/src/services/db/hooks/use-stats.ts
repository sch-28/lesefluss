import { useQuery } from "@tanstack/react-query";
import { queries } from "../queries";
import { statsKeys } from "./query-keys";

function usePeriodTotals(start: number, end: number, enabled = true) {
	return useQuery({
		queryKey: statsKeys.periodTotals(start, end),
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

function useWeeklyWpm(weeks = 12) {
	return useQuery({
		queryKey: statsKeys.weeklyWpm(weeks),
		queryFn: () => queries.getWeeklyWpm({ weeks }),
	});
}

function useHourHistogram() {
	return useQuery({
		queryKey: statsKeys.hourHistogram,
		queryFn: () => queries.getHourHistogram(),
	});
}

function usePersonality() {
	return useQuery({
		queryKey: statsKeys.personality,
		queryFn: () => queries.getPersonalityStats(),
	});
}

function useBookStats(bookId: string) {
	return useQuery({
		queryKey: statsKeys.book(bookId),
		queryFn: () => queries.getBookStats(bookId),
		enabled: !!bookId,
	});
}

function useSessionCount() {
	return useQuery({
		queryKey: statsKeys.sessionCount,
		queryFn: () => queries.getSessionCount(),
	});
}

export const statsHooks = {
	usePeriodTotals,
	useStreak,
	useTopBooks,
	useWeeklyWpm,
	useHourHistogram,
	usePersonality,
	useSessionCount,
	useBookStats,
};
