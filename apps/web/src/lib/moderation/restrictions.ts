import { and, count, eq, gt, gte, isNull, or } from "drizzle-orm";
import { type DbExecutor, db, type Tx } from "~/db";
import { type SocialRestriction, socialNotice, socialRestriction } from "~/db/schema";

/** Actioned notices against one user inside the window that suspend their sharing automatically. */
export const REPEAT_OFFENDER = { count: 3, windowDays: 180 } as const;

export const SUSPENSION_DURATIONS = ["7d", "30d", "permanent"] as const;
export type SuspensionDuration = (typeof SUSPENSION_DURATIONS)[number];

const DAY_MS = 86_400_000;

export function isSuspensionDuration(value: unknown): value is SuspensionDuration {
	return (SUSPENSION_DURATIONS as readonly unknown[]).includes(value);
}

export function suspensionUntil(duration: SuspensionDuration, now: Date): Date | null {
	if (duration === "permanent") return null;
	const days = duration === "7d" ? 7 : 30;
	return new Date(now.getTime() + days * DAY_MS);
}

function activeRestriction(userId: string, kind: SocialRestriction["kind"], now: Date) {
	return and(
		eq(socialRestriction.userId, userId),
		eq(socialRestriction.kind, kind),
		isNull(socialRestriction.liftedAt),
		or(isNull(socialRestriction.until), gt(socialRestriction.until, now)),
	);
}

/** Expiry is a comparison at read time: no job lifts a timed suspension. */
export async function isSharingSuspended(
	userId: string,
	now = new Date(),
	exec: DbExecutor = db,
): Promise<boolean> {
	const rows = await exec
		.select({ id: socialRestriction.id })
		.from(socialRestriction)
		.where(activeRestriction(userId, "sharing_suspended", now))
		.limit(1);
	return rows.length > 0;
}

export async function activeSharingSuspension(
	exec: DbExecutor,
	userId: string,
	now = new Date(),
): Promise<SocialRestriction | null> {
	const [row] = await exec
		.select()
		.from(socialRestriction)
		.where(activeRestriction(userId, "sharing_suspended", now))
		.limit(1);
	return row ?? null;
}

export async function suspendSharing(
	tx: Tx,
	input: {
		userId: string;
		until: Date | null;
		reason: string;
		noticeId: string | null;
		createdBy: string;
		now?: Date;
	},
): Promise<SocialRestriction> {
	const [row] = await tx
		.insert(socialRestriction)
		.values({
			userId: input.userId,
			kind: "sharing_suspended",
			until: input.until,
			reason: input.reason,
			noticeId: input.noticeId,
			createdBy: input.createdBy,
			createdAt: input.now ?? new Date(),
		})
		.returning();
	if (!row) throw new Error("restriction insert returned nothing");
	return row;
}

export async function liftRestriction(
	id: string,
	adminId: string,
	now = new Date(),
	exec: DbExecutor = db,
): Promise<boolean> {
	const rows = await exec
		.update(socialRestriction)
		.set({ liftedAt: now, liftedBy: adminId })
		.where(and(eq(socialRestriction.id, id), isNull(socialRestriction.liftedAt)))
		.returning({ id: socialRestriction.id });
	return rows.length > 0;
}

export async function listRestrictions(
	exec: DbExecutor = db,
	options: { userId?: string; activeOnly?: boolean; now?: Date } = {},
): Promise<SocialRestriction[]> {
	const now = options.now ?? new Date();
	return exec
		.select()
		.from(socialRestriction)
		.where(
			and(
				options.userId ? eq(socialRestriction.userId, options.userId) : undefined,
				options.activeOnly
					? and(
							isNull(socialRestriction.liftedAt),
							or(isNull(socialRestriction.until), gt(socialRestriction.until, now)),
						)
					: undefined,
			),
		)
		.orderBy(socialRestriction.createdAt);
}

/** Only notices that ended in an action count; open and rejected ones never do. */
export async function countActionedNotices(
	exec: DbExecutor,
	userId: string,
	now = new Date(),
): Promise<number> {
	const since = new Date(now.getTime() - REPEAT_OFFENDER.windowDays * DAY_MS);
	const [row] = await exec
		.select({ n: count() })
		.from(socialNotice)
		.where(
			and(
				eq(socialNotice.targetUserId, userId),
				eq(socialNotice.status, "actioned"),
				gte(socialNotice.decidedAt, since),
			),
		);
	return row?.n ?? 0;
}
