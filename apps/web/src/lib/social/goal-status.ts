import {
	type BuddyReadMemberGoal,
	dayNumberOf,
	goalAheadBehind,
	goalPlanLine,
	isFinishedPosition,
} from "@lesefluss/core";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import type { DbExecutor } from "~/db";
import { socialProfile, socialTakedown, syncBooks, syncReadingGoals } from "~/db/schema";
import { validTimeZone } from "./http";
import { dayOf } from "./profile-stats";

/**
 * Each member's standing against their own active goal on their buddy-read
 * copy, as the viewer may see it. Nothing at all unless the viewer shares live
 * activity; nothing for a member who does not, or whose time zone is unknown
 * (their day decides where the plan line stands), or who has finished the book.
 *
 * Only days ahead or behind are shared. Percent and days together would give
 * away the plan's daily amount and so the member's target date.
 *
 * A goal's book id is whatever the client pushed, so it only counts joined to
 * the member's own live, not taken-down `sync_books` row for that buddy read.
 * Needs no sessions: the position is the book's synced one.
 */
export async function memberGoalStatuses(
	exec: DbExecutor,
	viewerId: string,
	members: { userId: string; bookId: string }[],
	now: Date,
): Promise<Map<string, BuddyReadMemberGoal>> {
	const out = new Map<string, BuddyReadMemberGoal>();
	if (members.length === 0) return out;
	const profiles = await exec
		.select({
			userId: socialProfile.userId,
			sharesLive: socialProfile.shareLiveReading,
			timeZone: socialProfile.timeZone,
		})
		.from(socialProfile)
		.where(inArray(socialProfile.userId, [viewerId, ...members.map((m) => m.userId)]));
	if (profiles.some((p) => p.userId === viewerId && !p.sharesLive)) return out;
	const zones = new Map<string, string>();
	for (const p of profiles) {
		const zone = validTimeZone(p.timeZone);
		if (p.userId !== viewerId && p.sharesLive && zone) zones.set(p.userId, zone);
	}
	const shown = members.filter((m) => zones.has(m.userId));
	if (shown.length === 0) return out;

	const rows = await exec
		.select({
			userId: syncReadingGoals.userId,
			goal: {
				mode: syncReadingGoals.mode,
				planStartDate: syncReadingGoals.planStartDate,
				planStartWord: syncReadingGoals.planStartWord,
				targetDate: syncReadingGoals.targetDate,
				dailyPercent: syncReadingGoals.dailyPercent,
			},
			wordPosition: syncBooks.wordPosition,
			wordCount: syncBooks.wordCount,
		})
		.from(syncReadingGoals)
		.innerJoin(
			syncBooks,
			and(
				eq(syncBooks.userId, syncReadingGoals.userId),
				eq(syncBooks.bookId, syncReadingGoals.bookId),
				eq(syncBooks.deleted, false),
			),
		)
		.leftJoin(
			socialTakedown,
			and(
				eq(socialTakedown.userId, syncReadingGoals.userId),
				eq(socialTakedown.bookId, syncReadingGoals.bookId),
			),
		)
		.where(
			and(
				isNull(socialTakedown.id),
				eq(syncReadingGoals.status, "active"),
				eq(syncReadingGoals.deleted, false),
				or(
					...shown.map((m) =>
						and(eq(syncReadingGoals.userId, m.userId), eq(syncReadingGoals.bookId, m.bookId)),
					),
				),
			),
		)
		// Newest first: should a sync race leave two active goals, the newer one counts.
		.orderBy(desc(syncReadingGoals.createdAt), desc(syncReadingGoals.goalId));

	for (const row of rows) {
		const zone = zones.get(row.userId);
		if (out.has(row.userId) || !zone || !row.wordCount) continue;
		// A finished book completes the goal on the member's next read; until it syncs it still looks active.
		if (isFinishedPosition(row.wordPosition, row.wordCount)) continue;
		const today = dayNumberOf(dayOf(now, zone) ?? "");
		if (today === null) continue;
		const line = goalPlanLine(row.goal, row.wordCount);
		const { days } = goalAheadBehind(
			line,
			row.wordPosition,
			Math.max(today, line.planStartDay),
			row.wordCount,
		);
		out.set(row.userId, { aheadDays: Math.round(days * 10) / 10 });
	}
	return out;
}
