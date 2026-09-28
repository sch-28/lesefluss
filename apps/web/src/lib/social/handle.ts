import {
	HANDLE_CHANGE_COOLDOWN_DAYS,
	HANDLE_RELEASE_HOLD_DAYS,
	type HandleAvailability,
	normalizeHandle,
	validateHandle,
} from "@lesefluss/core";
import { and, eq, isNull } from "drizzle-orm";
import { db, type Tx } from "~/db";
import { user } from "~/db/auth-schema";
import { type SocialHandle, socialHandle, socialProfile } from "~/db/schema";
import { isUniqueViolation } from "~/lib/db-errors";
import { SocialError } from "./errors";
import { RESERVED_HANDLES } from "./reserved-handles";

const DAY_MS = 86_400_000;

function daysLeft(since: Date, days: number, now: Date): number {
	return Math.ceil((since.getTime() + days * DAY_MS - now.getTime()) / DAY_MS);
}

function cooldownDaysLeft(handleChangedAt: Date | null, now: Date): number {
	if (!handleChangedAt) return 0;
	return Math.max(0, daysLeft(handleChangedAt, HANDLE_CHANGE_COOLDOWN_DAYS, now));
}

/**
 * A handle row is free for `userId` when nobody holds it, its hold has
 * expired, or it is the caller's own released handle and reclaim is allowed.
 */
function isHandleFreeFor(row: SocialHandle | undefined, userId: string, now: Date): boolean {
	if (!row) return true;
	if (!row.releasedAt) return row.userId === userId;
	if (daysLeft(row.releasedAt, HANDLE_RELEASE_HOLD_DAYS, now) <= 0) return true;
	return row.reclaimable && row.userId === userId;
}

function normalizeOrReject(raw: string): string {
	if (!validateHandle(raw).ok) throw new SocialError("invalid");
	const handle = normalizeHandle(raw);
	if (RESERVED_HANDLES.has(handle)) throw new SocialError("reserved");
	return handle;
}

/** Answers for this one handle only; never a way to look users up. */
export async function checkHandleAvailability(
	userId: string,
	raw: string,
	now = new Date(),
): Promise<HandleAvailability> {
	let handle: string;
	try {
		handle = normalizeOrReject(raw);
	} catch (err) {
		if (err instanceof SocialError && (err.code === "invalid" || err.code === "reserved")) {
			return { available: false, reason: err.code };
		}
		throw err;
	}
	const [profile] = await db
		.select({ handle: socialProfile.handle, handleChangedAt: socialProfile.handleChangedAt })
		.from(socialProfile)
		.where(eq(socialProfile.userId, userId));
	if (profile?.handle === handle) return { available: true };
	const cooldown = cooldownDaysLeft(profile?.handleChangedAt ?? null, now);
	if (cooldown > 0) return { available: false, reason: "cooldown", retryAfterDays: cooldown };
	const [row] = await db.select().from(socialHandle).where(eq(socialHandle.handle, handle));
	return isHandleFreeFor(row, userId, now)
		? { available: true }
		: { available: false, reason: "taken" };
}

/**
 * Claims `raw` for `userId` and sets the display name in one transaction.
 * The social_handle primary key settles concurrent claims: the loser's insert
 * fails with a unique violation, reported as "taken".
 */
export async function claimHandle(
	userId: string,
	raw: string,
	name: string,
	now = new Date(),
): Promise<void> {
	const handle = normalizeOrReject(raw);
	try {
		await db.transaction(async (tx) => {
			// Serialises a user's claims even before they have a profile row, so two
			// concurrent first claims cannot both create an active handle.
			await tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).for("update");
			const [profile] = await tx
				.select({ handle: socialProfile.handle, handleChangedAt: socialProfile.handleChangedAt })
				.from(socialProfile)
				.where(eq(socialProfile.userId, userId));

			if (profile?.handle !== handle) {
				const cooldown = cooldownDaysLeft(profile?.handleChangedAt ?? null, now);
				if (cooldown > 0) throw new SocialError("cooldown", cooldown);

				const [row] = await tx
					.select()
					.from(socialHandle)
					.where(eq(socialHandle.handle, handle))
					.for("update");
				if (!isHandleFreeFor(row, userId, now)) throw new SocialError("taken");

				if (profile?.handle) {
					await tx
						.update(socialHandle)
						.set({ releasedAt: now, reclaimable: true })
						.where(and(eq(socialHandle.handle, profile.handle), eq(socialHandle.userId, userId)));
				}
				const claimed = { userId, claimedAt: now, releasedAt: null, reclaimable: true };
				if (row) {
					await tx.update(socialHandle).set(claimed).where(eq(socialHandle.handle, handle));
				} else {
					await tx.insert(socialHandle).values({ handle, ...claimed });
				}
				await tx
					.insert(socialProfile)
					.values({ userId, handle, handleChangedAt: now, updatedAt: now })
					.onConflictDoUpdate({
						target: socialProfile.userId,
						set: { handle, handleChangedAt: now, updatedAt: now },
					});
			}

			await tx.update(user).set({ name }).where(eq(user.id, userId));
		});
	} catch (err) {
		if (isUniqueViolation(err)) throw new SocialError("taken");
		throw err;
	}
}

/**
 * Admin reset: the handle goes into the 90-day hold with reclaim disabled and
 * the user has to pick a new one. The cooldown is cleared so they can.
 */
export async function forceResetHandle(userId: string, now = new Date()): Promise<void> {
	await db.transaction((tx) => forceResetHandleWithin(tx, userId, now));
}

export async function forceResetHandleWithin(tx: Tx, userId: string, now: Date): Promise<void> {
	await tx
		.update(socialHandle)
		.set({ releasedAt: now, reclaimable: false })
		.where(and(eq(socialHandle.userId, userId), isNull(socialHandle.releasedAt)));
	await tx
		.update(socialProfile)
		.set({ handle: null, handleChangedAt: null, updatedAt: now })
		.where(eq(socialProfile.userId, userId));
}

/**
 * Runs before the user row is deleted: the FK then nulls `user_id`, and the
 * released row blocks the handle for the hold period without naming anyone.
 */
export async function releaseHandlesForDeletedUser(
	tx: Tx,
	userId: string,
	now = new Date(),
): Promise<void> {
	await tx
		.update(socialHandle)
		.set({ releasedAt: now, reclaimable: false })
		.where(and(eq(socialHandle.userId, userId), isNull(socialHandle.releasedAt)));
}
