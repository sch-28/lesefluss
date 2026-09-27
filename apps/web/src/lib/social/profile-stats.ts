import { bookStatus, measuredReadingSpeed, type ProfileStats } from "@lesefluss/core";
import { and, eq } from "drizzle-orm";
import type { DbExecutor } from "~/db";
import { syncBooks, syncReadingSessions } from "~/db/schema";

/** Start of the current calendar year in the owner's zone, UTC when none is known. */
export function startOfYear(now: Date, timeZone: string | undefined): Date {
	if (!timeZone) return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
	const formatter = new Intl.DateTimeFormat("en-US", {
		timeZone,
		hour12: false,
		year: "numeric",
		month: "numeric",
		day: "numeric",
		hour: "numeric",
		minute: "numeric",
	});
	const year = Number(formatter.formatToParts(now).find((p) => p.type === "year")?.value);
	// Take the UTC midnight of 1 January and shift it by the zone's offset at that moment.
	const guess = new Date(Date.UTC(year, 0, 1));
	const parts = formatter.formatToParts(guess);
	const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
	const localAsUtc = Date.UTC(
		get("year"),
		get("month") - 1,
		get("day"),
		get("hour") % 24,
		get("minute"),
	);
	return new Date(guess.getTime() - (localAsUtc - guess.getTime()));
}

/**
 * Aggregate reading stats for one user as their profile shows them. Hidden and
 * deleted books stay out, including the sessions of hidden books. Time and
 * speed are null without synced sessions: missing data is not zero.
 */
export async function profileStatsFor(
	exec: DbExecutor,
	userId: string,
	options: { timeZone?: string; now?: Date } = {},
): Promise<ProfileStats> {
	const now = options.now ?? new Date();
	const yearStart = startOfYear(now, options.timeZone);
	const visible = and(
		eq(syncBooks.userId, userId),
		eq(syncBooks.deleted, false),
		eq(syncBooks.hideFromProfile, false),
	);
	const books = await exec
		.select({
			wordCount: syncBooks.wordCount,
			wordPosition: syncBooks.wordPosition,
			status: syncBooks.status,
			finishedAt: syncBooks.finishedAt,
		})
		.from(syncBooks)
		.where(visible);

	let booksFinishedThisYear = 0;
	let wordsRead = 0;
	for (const b of books) {
		const wordCount = b.wordCount ?? 0;
		wordsRead += Math.min(b.wordPosition, wordCount > 0 ? wordCount : b.wordPosition);
		const isFinished =
			bookStatus({ wordCount, wordPosition: b.wordPosition, status: b.status }) === "finished";
		if (isFinished && b.finishedAt && b.finishedAt >= yearStart) booksFinishedThisYear++;
	}

	const sessions = await exec
		.select({
			wordsRead: syncReadingSessions.wordsRead,
			durationMs: syncReadingSessions.durationMs,
		})
		.from(syncReadingSessions)
		.innerJoin(
			syncBooks,
			and(
				eq(syncBooks.userId, syncReadingSessions.userId),
				eq(syncBooks.bookId, syncReadingSessions.bookId),
			),
		)
		.where(and(eq(syncReadingSessions.userId, userId), visible));

	return {
		booksFinishedThisYear,
		wordsRead,
		readingTimeMs: sessions.length > 0 ? sessions.reduce((sum, s) => sum + s.durationMs, 0) : null,
		readingSpeedWpm: sessions.length > 0 ? measuredReadingSpeed(sessions) : null,
	};
}
