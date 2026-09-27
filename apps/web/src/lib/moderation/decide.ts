import { eq } from "drizzle-orm";
import { db, type Tx } from "~/db";
import { user } from "~/db/auth-schema";
import {
	type NoticeMailState,
	type SocialNotice,
	socialAvatar,
	socialNotice,
	socialProfile,
} from "~/db/schema";
import { forceResetHandleWithin } from "~/lib/social/handle";
import { createNotification } from "~/lib/social/inbox";
import { type BanDeps, betterAuthBan } from "./ban";
import { type Delivery, deliverMail } from "./deliver";
import { decisionMail, decisionText, reasonLabel, statementMail, statementText } from "./mail";
import {
	activeSharingSuspension,
	countActionedNotices,
	isSuspensionDuration,
	REPEAT_OFFENDER,
	type SuspensionDuration,
	suspendSharing,
	suspensionUntil,
} from "./restrictions";
import type { TakedownScope } from "./takedown";
import { takeDownReportedBook } from "./takedown-shares";
import { NOTICE_TARGETS, type NoticeActionKind, parseBookRef } from "./targets";

export class ModerationError extends Error {
	constructor(readonly code: "not_found" | "closed" | "unresolved" | "unsupported" | "invalid") {
		super(code);
	}
}

export type DecideInput = {
	noticeId: string;
	adminId: string;
	action: NoticeActionKind;
	/** The facts, in the admin's words; goes into the statement of reasons. */
	note?: string;
	duration?: SuspensionDuration;
	/** For a book takedown: the reported copy only, or every copy of its origin. */
	scope?: TakedownScope;
	/** The admin's request headers, needed by better-auth for a ban. */
	headers?: Headers;
	now?: Date;
};

export type DecideDeps = { ban: BanDeps };

const RULE = "Terms of Service, section Content rules and enforcement";

function formatUntil(until: Date | null): string {
	return until
		? `Until ${until.toISOString().slice(0, 10)}`
		: "Until further notice; you can ask us to review it";
}

type Statement = ReturnType<typeof statementText>;

function factsOf(notice: SocialNotice, note: string | undefined): string {
	return [`Reported as: ${reasonLabel(notice.reason)}.`, note?.trim()].filter(Boolean).join(" ");
}

/**
 * A ban cannot join the decision transaction: better-auth writes through its
 * own connection. It runs first and is idempotent, so a transaction that then
 * fails leaves an open notice whose re-decision bans again without harm.
 */
async function banBeforeDeciding(input: DecideInput, deps: DecideDeps): Promise<void> {
	if (!input.headers) throw new ModerationError("invalid");
	const [notice] = await db.select().from(socialNotice).where(eq(socialNotice.id, input.noticeId));
	if (!notice) throw new ModerationError("not_found");
	if (notice.status !== "open") throw new ModerationError("closed");
	if (!notice.targetUserId) throw new ModerationError("unresolved");
	if (!NOTICE_TARGETS[notice.targetType].actions.includes("ban")) {
		throw new ModerationError("unsupported");
	}
	await deps.ban.ban(notice.targetUserId, factsOf(notice, input.note), input.headers);
}

async function applyAction(
	tx: Tx,
	notice: SocialNotice,
	input: DecideInput,
	now: Date,
): Promise<Statement | null> {
	const targetUserId = notice.targetUserId;
	if (input.action === "reject") return null;
	if (!targetUserId) throw new ModerationError("unresolved");
	if (!NOTICE_TARGETS[notice.targetType].actions.includes(input.action)) {
		throw new ModerationError("unsupported");
	}
	const facts = factsOf(notice, input.note);
	const permanent = "Permanent";

	switch (input.action) {
		case "remove_bio":
			await tx
				.update(socialProfile)
				.set({ bio: null, updatedAt: now })
				.where(eq(socialProfile.userId, targetUserId));
			return statementText({
				what: "We removed the bio from your profile.",
				duration: `${permanent}. You may write a new bio that follows the rules.`,
				facts,
				rule: RULE,
			});
		case "remove_avatar":
			await tx.delete(socialAvatar).where(eq(socialAvatar.userId, targetUserId));
			return statementText({
				what: "We removed your profile picture.",
				duration: `${permanent}. You may upload a new picture that follows the rules.`,
				facts,
				rule: RULE,
			});
		case "reset_handle": {
			const handle = notice.targetSnapshot?.handle ?? notice.targetRef;
			await forceResetHandleWithin(tx, targetUserId, now);
			return statementText({
				what: `We released your handle @${handle}. Your profile is hidden until you pick a new one.`,
				duration: `${permanent}. The old handle cannot be reclaimed.`,
				facts,
				rule: RULE,
			});
		}
		case "take_down_book": {
			const ref = parseBookRef(notice.targetRef);
			if (!ref) throw new ModerationError("unresolved");
			const scope = input.scope ?? "copy";
			const snapshot = notice.targetSnapshot;
			const recordedOrigin =
				snapshot?.originUserId && snapshot.originBookId
					? { originUserId: snapshot.originUserId, originBookId: snapshot.originBookId }
					: null;
			await takeDownReportedBook(tx, ref, scope, notice.id, now, recordedOrigin);
			const title = notice.targetSnapshot?.title ?? "the reported book";
			return statementText({
				what:
					scope === "origin"
						? `We removed the book "${title}" from your library and from the libraries of everyone you shared it with. Devices delete it on the next sync.`
						: `We removed the book "${title}" from your library. Your devices delete it on the next sync.`,
				duration: `${permanent}. It cannot be uploaded or shared again.`,
				facts,
				rule: RULE,
			});
		}
		case "suspend_sharing": {
			if (!isSuspensionDuration(input.duration)) throw new ModerationError("invalid");
			const until = suspensionUntil(input.duration, now);
			await suspendSharing(tx, {
				userId: targetUserId,
				until,
				reason: facts,
				noticeId: notice.id,
				createdBy: input.adminId,
				now,
			});
			return statementText({
				what: "We suspended sharing for your account: you cannot share books, start buddy reads or share highlights. Reading and sync continue.",
				duration: formatUntil(until),
				facts,
				rule: RULE,
			});
		}
		case "ban":
			// Applied in `banBeforeDeciding`: better-auth writes on its own connection.
			return statementText({
				what: "We closed your access to Lesefluss. You cannot sign in; your data stays until you ask us to delete it or the ban is lifted.",
				duration: "Until further notice",
				facts,
				rule: RULE,
			});
	}
}

/** The repeat-offender rule: its own restriction with its own statement, once per streak. */
async function autoSuspend(tx: Tx, notice: SocialNotice, now: Date): Promise<string | null> {
	const targetUserId = notice.targetUserId;
	if (!targetUserId) return null;
	if ((await countActionedNotices(tx, targetUserId, now)) < REPEAT_OFFENDER.count) return null;
	if (await activeSharingSuspension(tx, targetUserId, now)) return null;
	const reason = `${REPEAT_OFFENDER.count} notices upheld within ${REPEAT_OFFENDER.windowDays} days`;
	await suspendSharing(tx, {
		userId: targetUserId,
		until: null,
		reason,
		noticeId: notice.id,
		createdBy: "auto",
		now,
	});
	return statementText({
		what: "In addition, we suspended sharing for your account: you cannot share books, start buddy reads or share highlights.",
		duration: "Until we have reviewed your account",
		facts: `${reason}.`,
		rule: RULE,
	});
}

async function targetEmail(userId: string | null): Promise<string | null> {
	if (!userId) return null;
	const [row] = await db.select({ email: user.email }).from(user).where(eq(user.id, userId));
	return row?.email ?? null;
}

async function saveMailState(noticeId: string, patch: NoticeMailState): Promise<void> {
	const [current] = await db
		.select({ mailState: socialNotice.mailState })
		.from(socialNotice)
		.where(eq(socialNotice.id, noticeId));
	await db
		.update(socialNotice)
		.set({ mailState: { ...(current?.mailState ?? {}), ...patch } })
		.where(eq(socialNotice.id, noticeId));
}

function withText(delivery: Delivery, text?: string) {
	return text ? { ...delivery, text } : delivery;
}

/**
 * Closes a notice with one action. The action, the notice update, the
 * repeat-offender check and the inbox items share a transaction; the mails go
 * out afterwards and only record how they went.
 */
export async function decideNotice(
	input: DecideInput,
	deps: DecideDeps = { ban: betterAuthBan },
): Promise<{ statement: string | null }> {
	const now = input.now ?? new Date();
	const outcome = input.action === "reject" ? "rejected" : "actioned";
	if (input.action === "ban") await banBeforeDeciding(input, deps);

	const { notice, statement } = await db.transaction(async (tx) => {
		const [notice] = await tx
			.select()
			.from(socialNotice)
			.where(eq(socialNotice.id, input.noticeId))
			.for("update");
		if (!notice) throw new ModerationError("not_found");
		if (notice.status !== "open") throw new ModerationError("closed");

		const base = await applyAction(tx, notice, input, now);
		await tx
			.update(socialNotice)
			.set({
				status: outcome,
				decidedAt: now,
				decidedBy: input.adminId,
				decision: input.action,
				decisionNote: input.note?.trim() || null,
			})
			.where(eq(socialNotice.id, notice.id));

		// The reported account may be gone (a takedown reaches copies regardless);
		// then there is nobody to restrict further or to write to.
		const targetExists = notice.targetUserId
			? (await tx.select({ id: user.id }).from(user).where(eq(user.id, notice.targetUserId)))
					.length > 0
			: false;
		let statement = base;
		if (outcome === "actioned" && targetExists) {
			const extra = await autoSuspend(tx, notice, now);
			if (extra && statement) statement = `${statement}\n\n${extra}`;
		}
		if (statement && notice.targetUserId && targetExists) {
			await createNotification(
				tx,
				{
					recipientId: notice.targetUserId,
					actorId: null,
					type: "statement_of_reasons",
					subjectId: notice.id,
					payload: { text: statement },
				},
				now,
			);
		}
		if (notice.notifierUserId) {
			await createNotification(
				tx,
				{
					recipientId: notice.notifierUserId,
					actorId: null,
					type: "notice_decision",
					subjectId: notice.id,
					payload: { text: decisionText(outcome) },
				},
				now,
			);
		}
		return { notice, statement };
	});

	const mailState: NoticeMailState = {};
	if (statement) {
		const to = await targetEmail(notice.targetUserId);
		mailState.statement = withText(
			to
				? await deliverMail({ to, ...statementMail(statement) }, now)
				: { status: "skipped", at: now.getTime() },
			statement,
		);
	}
	if (notice.source === "web" && notice.notifierEmail) {
		mailState.notifier = await deliverMail(
			{ to: notice.notifierEmail, ...decisionMail(notice.id, outcome) },
			now,
		);
	}
	await saveMailState(notice.id, mailState);
	return { statement };
}

/** Retries one of the two decision mails; the text is what was decided, not recomputed. */
export async function resendNoticeMail(
	noticeId: string,
	which: "statement" | "notifier",
	now = new Date(),
): Promise<Delivery> {
	const [notice] = await db.select().from(socialNotice).where(eq(socialNotice.id, noticeId));
	if (!notice || notice.status === "open") throw new ModerationError("not_found");
	let delivery: Delivery;
	if (which === "statement") {
		const text = notice.mailState.statement?.text;
		const to = await targetEmail(notice.targetUserId);
		delivery =
			text && to
				? await deliverMail({ to, ...statementMail(text) }, now)
				: { status: "skipped", at: now.getTime() };
		await saveMailState(noticeId, { statement: withText(delivery, text) });
	} else {
		delivery = notice.notifierEmail
			? await deliverMail(
					{ to: notice.notifierEmail, ...decisionMail(notice.id, notice.status) },
					now,
				)
			: { status: "skipped", at: now.getTime() };
		await saveMailState(noticeId, { notifier: delivery });
	}
	return delivery;
}
