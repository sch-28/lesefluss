import type { SyncReadingGoal } from "@lesefluss/core";
import { type SQL, sql } from "drizzle-orm";
import type { DbExecutor } from "~/db";
import { type NewSyncReadingGoal, syncReadingGoals } from "~/db/schema";

/**
 * Last-write-wins upsert of pushed goals. A goal is never tombstoned for being
 * absent from a push: goals created on another device since this one last
 * pulled would otherwise be deleted by every push.
 *
 * A client from before minute goals omits `dailyMinutes`; its goals win by
 * stamp but leave the stored minutes alone, unless it moved the goal off pace,
 * where minutes have no meaning.
 */
export async function upsertSyncGoals(
	exec: DbExecutor,
	userId: string,
	goals: SyncReadingGoal[],
): Promise<void> {
	const withMinutes = goals.filter((g) => g.dailyMinutes !== undefined);
	const withoutMinutes = goals.filter((g) => g.dailyMinutes === undefined);
	await upsertGoalRows(exec, userId, withMinutes, { dailyMinutes: sql`excluded.daily_minutes` });
	await upsertGoalRows(exec, userId, withoutMinutes, {
		dailyMinutes: sql`CASE WHEN excluded.mode = 'pace' THEN sync_reading_goals.daily_minutes END`,
	});
}

async function upsertGoalRows(
	exec: DbExecutor,
	userId: string,
	goals: SyncReadingGoal[],
	optional: Record<string, SQL>,
): Promise<void> {
	if (goals.length === 0) return;
	await exec
		.insert(syncReadingGoals)
		.values(goals.map((g) => goalInsertValues(userId, g)))
		.onConflictDoUpdate({
			target: [syncReadingGoals.userId, syncReadingGoals.goalId],
			set: {
				bookId: sql`excluded.book_id`,
				mode: sql`excluded.mode`,
				status: sql`excluded.status`,
				startedAt: sql`excluded.started_at`,
				startWord: sql`excluded.start_word`,
				planStartDate: sql`excluded.plan_start_date`,
				planStartWord: sql`excluded.plan_start_word`,
				targetDate: sql`excluded.target_date`,
				dailyPercent: sql`excluded.daily_percent`,
				carriedDaysMet: sql`excluded.carried_days_met`,
				completedAt: sql`excluded.completed_at`,
				reminderTime: sql`excluded.reminder_time`,
				deleted: sql`excluded.deleted`,
				createdAt: sql`excluded.created_at`,
				updatedAt: sql`excluded.updated_at`,
				...optional,
			},
			setWhere: sql`excluded.updated_at > sync_reading_goals.updated_at`,
		});
}

function goalInsertValues(userId: string, g: SyncReadingGoal): NewSyncReadingGoal {
	return {
		userId,
		goalId: g.goalId,
		bookId: g.bookId,
		mode: g.mode,
		status: g.status,
		startedAt: new Date(g.startedAt),
		startWord: g.startWord,
		planStartDate: g.planStartDate,
		planStartWord: g.planStartWord,
		targetDate: g.targetDate,
		dailyPercent: g.dailyPercent,
		dailyMinutes: g.dailyMinutes ?? null,
		carriedDaysMet: g.carriedDaysMet,
		completedAt: g.completedAt != null ? new Date(g.completedAt) : null,
		reminderTime: g.reminderTime,
		deleted: g.deleted,
		createdAt: new Date(g.createdAt),
		// Not clamped to server time, unlike books: every push resends every goal
		// with the device's own stamp, so a clamped fast clock would land a fresh
		// "now" on each push and beat newer edits indefinitely. Unclamped, it wins
		// only until real time passes its stamp.
		updatedAt: new Date(g.updatedAt),
	};
}
