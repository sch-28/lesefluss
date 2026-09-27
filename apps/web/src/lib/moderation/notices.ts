import type { NoticeReason, NoticeTargetType, ReportBody, WebNoticeBody } from "@lesefluss/core";
import { and, asc, eq, isNotNull, lt, sql } from "drizzle-orm";
import { type DbExecutor, db } from "~/db";
import { type NoticeStatus, type SocialNotice, socialNotice } from "~/db/schema";
import { checkLimit } from "~/lib/rate-limit";
import { SocialError } from "~/lib/social/errors";
import { blockUser } from "~/lib/social/friends";
import { loadSocialUsers } from "~/lib/social/relationship";
import { deliverMail } from "./deliver";
import { alertMail, NOTICES_TO, receiptMail } from "./mail";
import { NOTICE_TARGETS } from "./targets";

export const NOTICE_RETENTION_DAYS = 730;
const DAY_MS = 86_400_000;

async function alert(notice: SocialNotice): Promise<void> {
	const result = await deliverMail({ to: NOTICES_TO, ...alertMail(notice) });
	if (result.status === "failed") console.error("notice alert failed", notice.id, result.error);
}

/** In-app report by a signed-in user about another user. */
export async function createNotice(
	notifierUserId: string,
	body: ReportBody,
	now = new Date(),
): Promise<{ id: string }> {
	if (body.targetUserId === notifierUserId) throw new SocialError("invalid");
	// A banned or handle-less user can still be reported: their content may be live.
	const users = await loadSocialUsers(db, [body.targetUserId]);
	if (!users.has(body.targetUserId)) throw new SocialError("not_found");
	const resolved = await NOTICE_TARGETS[body.targetType].resolveById(
		db,
		body.targetUserId,
		body.subjectId,
		notifierUserId,
	);
	if (!resolved) throw new SocialError("not_found");

	const [notice] = await db
		.insert(socialNotice)
		.values({
			targetType: body.targetType,
			targetRef: resolved.targetRef,
			targetUserId: resolved.targetUserId,
			targetSnapshot: resolved.snapshot,
			reason: body.reason,
			text: body.text,
			source: "app",
			notifierUserId,
			createdAt: now,
		})
		.returning();
	if (!notice) throw new Error("notice insert returned nothing");
	if (body.block) await blockUser(notifierUserId, body.targetUserId, now);
	await alert(notice);
	return { id: notice.id };
}

// The address is typed, not verified: a stranger's inbox must not become a target.
const RECEIPT_LIMIT = { max: 3, windowMs: 30 * 24 * 60 * 60_000 };

/** Public form. An unresolved location is kept as typed; the notifier never learns whether it matched. */
export async function createWebNotice(
	body: WebNoticeBody,
	now = new Date(),
): Promise<{ id: string }> {
	const resolved = await NOTICE_TARGETS[body.targetType].resolveByLocation(db, body.location);
	const [notice] = await db
		.insert(socialNotice)
		.values({
			targetType: body.targetType,
			targetRef: resolved?.targetRef ?? body.location,
			targetUserId: resolved?.targetUserId ?? null,
			targetSnapshot: resolved?.snapshot ?? null,
			reason: body.reason,
			text: body.text,
			source: "web",
			notifierName: body.name,
			notifierEmail: body.email,
			createdAt: now,
		})
		.returning();
	if (!notice) throw new Error("notice insert returned nothing");
	await alert(notice);
	if (checkLimit(`report-receipt:${body.email}`, RECEIPT_LIMIT).ok) {
		await deliverMail({ to: body.email, ...receiptMail(notice.id) });
	}
	return { id: notice.id };
}

export type NoticeFilter = {
	status?: NoticeStatus;
	targetType?: NoticeTargetType;
	reason?: NoticeReason;
};

/** Closed notices are kept 24 months after the decision. No scheduler: the queue load purges. */
export async function purgeExpiredNotices(exec: DbExecutor, now = new Date()): Promise<void> {
	const cutoff = new Date(now.getTime() - NOTICE_RETENTION_DAYS * DAY_MS);
	await exec
		.delete(socialNotice)
		.where(and(isNotNull(socialNotice.decidedAt), lt(socialNotice.decidedAt, cutoff)));
}

/** Open first, oldest first, so the queue head is the notice that has waited longest. */
export async function listNotices(
	filter: NoticeFilter = {},
	now = new Date(),
	exec: DbExecutor = db,
): Promise<SocialNotice[]> {
	await purgeExpiredNotices(exec, now);
	return exec
		.select()
		.from(socialNotice)
		.where(
			and(
				filter.status ? eq(socialNotice.status, filter.status) : undefined,
				filter.targetType ? eq(socialNotice.targetType, filter.targetType) : undefined,
				filter.reason ? eq(socialNotice.reason, filter.reason) : undefined,
			),
		)
		.orderBy(
			sql`CASE WHEN ${socialNotice.status} = 'open' THEN 0 ELSE 1 END`,
			asc(socialNotice.createdAt),
		);
}
