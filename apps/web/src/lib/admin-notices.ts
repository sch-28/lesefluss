import type { NoticeReason, NoticeTargetType } from "@lesefluss/core";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { db } from "~/db";
import { user } from "~/db/auth-schema";
import { type NoticeStatus, socialNotice, socialProfile } from "~/db/schema";
import { requireAdminSession } from "./admin";
import { betterAuthBan } from "./moderation/ban";
import { decideNotice, ModerationError, resendNoticeMail } from "./moderation/decide";
import { listNotices } from "./moderation/notices";
import {
	liftRestriction,
	listRestrictions,
	type SuspensionDuration,
} from "./moderation/restrictions";
import type { TakedownScope } from "./moderation/takedown";
import { NOTICE_TARGETS, type NoticeActionKind } from "./moderation/targets";

function moderationResponse(err: unknown): never {
	if (err instanceof ModerationError) {
		const status = err.code === "not_found" ? 404 : err.code === "closed" ? 409 : 400;
		throw new Response(err.code, { status });
	}
	throw err;
}

export const getNotices = createServerFn({ method: "GET" })
	.inputValidator(
		(data: { status?: NoticeStatus; targetType?: NoticeTargetType; reason?: NoticeReason }) => data,
	)
	.handler(async ({ data }) => {
		await requireAdminSession();
		const notices = await listNotices(data);
		return notices.map((n) => ({
			...n,
			createdAt: n.createdAt.getTime(),
			decidedAt: n.decidedAt?.getTime() ?? null,
		}));
	});

export type AdminNotice = Awaited<ReturnType<typeof getNotices>>[number];

export const getNoticeContext = createServerFn({ method: "GET" })
	.inputValidator((data: { id: string }) => data)
	.handler(async ({ data }) => {
		await requireAdminSession();
		const [notice] = await db.select().from(socialNotice).where(eq(socialNotice.id, data.id));
		if (!notice) throw new Response("Not found", { status: 404 });
		const target = NOTICE_TARGETS[notice.targetType];
		const [live, targetUser, restrictions] = await Promise.all([
			target.context(db, notice),
			notice.targetUserId
				? db
						.select({
							id: user.id,
							name: user.name,
							email: user.email,
							banned: user.banned,
							handle: socialProfile.handle,
						})
						.from(user)
						.leftJoin(socialProfile, eq(socialProfile.userId, user.id))
						.where(eq(user.id, notice.targetUserId))
						.then((rows) => rows[0] ?? null)
				: Promise.resolve(null),
			notice.targetUserId
				? listRestrictions(db, { userId: notice.targetUserId })
				: Promise.resolve([]),
		]);
		return {
			live,
			targetUser,
			actions: target.actions,
			restrictions: restrictions.map((r) => ({
				...r,
				until: r.until?.getTime() ?? null,
				createdAt: r.createdAt.getTime(),
				liftedAt: r.liftedAt?.getTime() ?? null,
			})),
		};
	});

export const decideAdminNotice = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			noticeId: string;
			action: NoticeActionKind;
			note?: string;
			duration?: SuspensionDuration;
			scope?: TakedownScope;
		}) => data,
	)
	.handler(async ({ data }) => {
		const session = await requireAdminSession();
		try {
			return await decideNotice(
				{ ...data, adminId: session.user.id, headers: getRequest().headers },
				{ ban: betterAuthBan },
			);
		} catch (err) {
			moderationResponse(err);
		}
	});

export const resendAdminNoticeMail = createServerFn({ method: "POST" })
	.inputValidator((data: { noticeId: string; which: "statement" | "notifier" }) => data)
	.handler(async ({ data }) => {
		await requireAdminSession();
		try {
			return await resendNoticeMail(data.noticeId, data.which);
		} catch (err) {
			moderationResponse(err);
		}
	});

export const getAdminRestrictions = createServerFn({ method: "GET" }).handler(async () => {
	await requireAdminSession();
	const rows = await listRestrictions(db, { activeOnly: true });
	return rows.map((r) => ({
		...r,
		until: r.until?.getTime() ?? null,
		createdAt: r.createdAt.getTime(),
		liftedAt: r.liftedAt?.getTime() ?? null,
	}));
});

export const liftAdminRestriction = createServerFn({ method: "POST" })
	.inputValidator((data: { id: string }) => data)
	.handler(async ({ data }) => {
		const session = await requireAdminSession();
		const lifted = await liftRestriction(data.id, session.user.id);
		if (!lifted) throw new Response("Not found", { status: 404 });
		return { success: true };
	});

export const unbanAdminUser = createServerFn({ method: "POST" })
	.inputValidator((data: { userId: string }) => data)
	.handler(async ({ data }) => {
		await requireAdminSession();
		await betterAuthBan.unban(data.userId, getRequest().headers);
		return { success: true };
	});
