import { isFinishedPosition, measuredReadingSpeed } from "@lesefluss/core";
import { and, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { randomHexId } from "../../../utils/random-id";
import {
	type GoalChange,
	type GoalPlanFields,
	type GoalPlanInput,
	type NewGoalSpec,
	newGoalPlanFields,
	planReadingGoal,
	type ReadingGoalPlanResult,
	replanGoal,
} from "../../stats/reading-goal";
import { db } from "../index";
import { type Book, books, type ReadingGoal, readingGoals, readingSessions } from "../schema";
import { getBook, isFinishedSql } from "./books";
import { getMeasuredReadingSpeed } from "./stats";

const UPSERT_CHUNK_SIZE = 200;

const isLive = and(eq(readingGoals.status, "active"), eq(readingGoals.deleted, false));

/** The book's active goal. Newest wins if a sync race left two behind. */
export async function getActiveGoal(bookId: string): Promise<ReadingGoal | null> {
	const rows = await db
		.select()
		.from(readingGoals)
		.where(and(eq(readingGoals.bookId, bookId), isLive))
		.orderBy(desc(readingGoals.createdAt), desc(readingGoals.id))
		.limit(1);
	return rows[0] ?? null;
}

/** Every goal the book has had, newest first, without tombstones. */
export async function getGoalsForBook(bookId: string): Promise<ReadingGoal[]> {
	return db
		.select()
		.from(readingGoals)
		.where(and(eq(readingGoals.bookId, bookId), eq(readingGoals.deleted, false)))
		.orderBy(desc(readingGoals.createdAt));
}

export async function getAllGoalsForSync(): Promise<ReadingGoal[]> {
	return db.select().from(readingGoals);
}

/**
 * Start a goal at the book's current position. A goal already active on the
 * book is abandoned: one active goal per book.
 *
 * The new row goes in first. These are separate bridge calls, and dying between
 * them should leave two active goals (which `getActiveGoal` and the sync pull
 * resolve) rather than none.
 */
export async function createGoal(
	book: Pick<Book, "id" | "seriesId" | "deleted" | "wordPosition" | "wordCount">,
	spec: NewGoalSpec,
	now: number = Date.now(),
	reminderTime: string | null = null,
): Promise<ReadingGoal> {
	if (book.seriesId !== null)
		throw new Error("Reading goals are not available for serial chapters");
	if (book.deleted) throw new Error("Cannot set a goal on a deleted book");
	if (isFinishedPosition(book.wordPosition, book.wordCount)) {
		throw new Error("Cannot set a goal on a finished book");
	}
	const goal: ReadingGoal = {
		id: randomHexId(),
		bookId: book.id,
		status: "active",
		startedAt: now,
		startWord: book.wordPosition,
		...newGoalPlanFields(spec, book.wordPosition, book.wordCount, now),
		completedAt: null,
		reminderTime,
		deleted: false,
		createdAt: now,
		updatedAt: now,
	};
	await db.insert(readingGoals).values(goal);
	await db
		.update(readingGoals)
		.set({ status: "abandoned", updatedAt: now })
		.where(and(eq(readingGoals.bookId, book.id), isLive, ne(readingGoals.id, goal.id)));
	return goal;
}

/** Apply a replan (see `replanGoal`). */
export async function updateGoal(
	id: string,
	fields: Partial<GoalPlanFields>,
	now: number = Date.now(),
): Promise<void> {
	await db
		.update(readingGoals)
		.set({ ...fields, updatedAt: now })
		.where(eq(readingGoals.id, id));
}

/** `null` switches the reminder off. Stamped, so the choice follows the goal to other devices. */
export async function setGoalReminder(
	id: string,
	reminderTime: string | null,
	now: number = Date.now(),
): Promise<void> {
	await db
		.update(readingGoals)
		.set({ reminderTime, updatedAt: now })
		.where(eq(readingGoals.id, id));
}

/** Active goals with a reminder, for the scheduler. */
export async function getGoalsWithReminders(): Promise<ReadingGoal[]> {
	return db
		.select()
		.from(readingGoals)
		.where(and(isLive, isNotNull(readingGoals.reminderTime)));
}

/** Tombstone, so the removal syncs. The pull hard-deletes it once the server agrees. */
export async function deleteGoal(id: string, now: number = Date.now()): Promise<void> {
	await db
		.update(readingGoals)
		.set({ deleted: true, updatedAt: now })
		.where(eq(readingGoals.id, id));
}

/**
 * Complete every active goal whose book crossed the finished threshold, the
 * same rule that stamps `books.finished_at`. One statement for the whole
 * library, so it is cheap to run on every goal read and after a sync pull,
 * which together cover positions written by the reader, a BLE device and sync.
 */
export async function completeFinishedGoals(now: number = Date.now()): Promise<void> {
	await db
		.update(readingGoals)
		.set({ status: "completed", completedAt: now, updatedAt: now })
		.where(
			and(
				isLive,
				inArray(
					readingGoals.bookId,
					db.select({ id: books.id }).from(books).where(isFinishedSql()),
				),
			),
		);
}

/**
 * Two devices that each created a goal for the same book offline both push an
 * active one. The newest created stays active, the rest are abandoned. Stamped
 * now so the outcome syncs; every device picks the same winner.
 */
export async function resolveActiveGoalConflicts(now: number = Date.now()): Promise<void> {
	await db
		.update(readingGoals)
		.set({ status: "abandoned", updatedAt: now })
		.where(
			and(
				isLive,
				sql`EXISTS (SELECT 1 FROM reading_goals newer
					WHERE newer.book_id = ${readingGoals.bookId}
						AND newer.status = 'active' AND newer.deleted = 0
						AND (newer.created_at > ${readingGoals.createdAt}
							OR (newer.created_at = ${readingGoals.createdAt} AND newer.id > ${readingGoals.id})))`,
			),
		);
}

/** Last-write-wins on `updatedAt`, chunked like the session upsert. */
export async function upsertGoals(rows: ReadingGoal[]): Promise<void> {
	for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
		await db
			.insert(readingGoals)
			.values(rows.slice(i, i + UPSERT_CHUNK_SIZE))
			.onConflictDoUpdate({
				target: readingGoals.id,
				set: EXCLUDED_GOAL_COLUMNS,
				where: sql`${readingGoals.updatedAt} < excluded.updated_at`,
			});
	}
}

const EXCLUDED_GOAL_COLUMNS = {
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
};

export async function hardDeleteGoals(ids: string[]): Promise<void> {
	for (let i = 0; i < ids.length; i += UPSERT_CHUNK_SIZE) {
		await db
			.delete(readingGoals)
			.where(inArray(readingGoals.id, ids.slice(i, i + UPSERT_CHUNK_SIZE)));
	}
}

/** What the plan needs from this book's sessions, plus what measures its speed. */
async function getGoalSessions(bookId: string) {
	return db
		.select({
			mode: readingSessions.mode,
			startedAt: readingSessions.startedAt,
			endedAt: readingSessions.endedAt,
			startWord: readingSessions.startWord,
			endWord: readingSessions.endWord,
			furthestWord: readingSessions.furthestWord,
			wordsRead: readingSessions.wordsRead,
			durationMs: readingSessions.durationMs,
		})
		.from(readingSessions)
		.where(eq(readingSessions.bookId, bookId));
}

async function loadPlanInput(goal: ReadingGoal, book: Book, now: number): Promise<GoalPlanInput> {
	const [sessions, global] = await Promise.all([
		getGoalSessions(goal.bookId),
		getMeasuredReadingSpeed(),
	]);
	return {
		goal,
		book,
		sessions,
		bookWpm: measuredReadingSpeed(sessions),
		globalWpm: global.wpm,
		now,
	};
}

/**
 * The book's active goal with its plan. Without one, the newest goal if it was
 * completed and the book still counts as finished, so finishing shows the
 * result; reading the book again, or removing a later goal, does not bring an
 * old completion back.
 */
export async function getReadingGoalPlan(
	bookId: string,
	now: number = Date.now(),
): Promise<{ goal: ReadingGoal; plan: ReadingGoalPlanResult } | null> {
	await completeFinishedGoals(now);
	const [rows, book] = await Promise.all([
		db
			.select()
			.from(readingGoals)
			.where(eq(readingGoals.bookId, bookId))
			.orderBy(desc(readingGoals.createdAt), desc(readingGoals.id)),
		getBook(bookId),
	]);
	if (!book) return null;
	const newest = rows[0];
	const goal =
		rows.find((g) => g.status === "active" && !g.deleted) ??
		(newest &&
		!newest.deleted &&
		newest.status === "completed" &&
		isFinishedPosition(book.wordPosition, book.wordCount)
			? newest
			: null);
	if (!goal) return null;
	return { goal, plan: planReadingGoal(await loadPlanInput(goal, book, now)) };
}

/** Change mode, target date or daily percent; the plan restarts from today (see `replanGoal`). */
export async function replanGoalById(
	id: string,
	change: GoalChange,
	now: number = Date.now(),
): Promise<void> {
	const [goal] = await db.select().from(readingGoals).where(eq(readingGoals.id, id));
	if (!goal) return;
	const book = await getBook(goal.bookId);
	if (!book) return;
	await updateGoal(id, replanGoal(await loadPlanInput(goal, book, now), change), now);
}
