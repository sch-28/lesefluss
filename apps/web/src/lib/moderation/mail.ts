import { NOTICE_REASON_LABELS, type NoticeReason } from "@lesefluss/core";
import type { SocialNotice } from "~/db/schema";
import { escapeHtml } from "~/lib/public-form";

export const NOTICES_TO = "notices@lesefluss.app";
export const TERMS_URL = "https://lesefluss.app/terms";

const paragraphs = (lines: string[]) =>
	lines.map((l) => `<p style="color:#333;white-space:pre-wrap;">${l}</p>`).join("\n");

const wrap = (title: string, body: string) => `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f6f6f6;margin:0;padding:32px;">
<table role="presentation" style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;"><tr><td>
<h1 style="margin:0 0 16px;font-size:20px;color:#111;">${title}</h1>
${body}
<p style="margin-top:32px;font-size:12px;color:#888;">Lesefluss · ${NOTICES_TO}</p>
</td></tr></table></body></html>`;

export function reasonLabel(reason: string): string {
	return NOTICE_REASON_LABELS[reason as NoticeReason] ?? reason;
}

/** For us. The only mail that carries the notifier's text. */
export function alertMail(notice: SocialNotice) {
	const rows: [string, string | null | undefined][] = [
		["Notice", notice.id],
		["Type", notice.targetType],
		["Target", notice.targetRef],
		["Resolved user", notice.targetUserId],
		["Reason", reasonLabel(notice.reason)],
		["Source", notice.source],
		["Notifier", notice.notifierUserId ?? `${notice.notifierName} <${notice.notifierEmail}>`],
	];
	const snapshot = notice.targetSnapshot
		? Object.entries(notice.targetSnapshot)
				.map(([k, v]) => `<p><strong>${escapeHtml(k)}:</strong> ${escapeHtml(v ?? "")}</p>`)
				.join("\n")
		: "";
	return {
		subject: `Lesefluss notice: ${notice.targetType} (${reasonLabel(notice.reason)})`,
		html: `<p>New notice.</p>
${rows.map(([k, v]) => `<p><strong>${k}:</strong> ${escapeHtml(v ?? "-")}</p>`).join("\n")}
<hr><p><strong>Snapshot</strong></p>${snapshot}
<hr><p style="white-space:pre-wrap;">${escapeHtml(notice.text)}</p>`,
	};
}

/** To a web notifier. Never repeats what they wrote: the address was typed by them, not verified. */
export function receiptMail(noticeId: string) {
	return {
		subject: "We received your notice",
		html: wrap(
			"Notice received",
			paragraphs([
				`Thank you. We received your notice and will review it. Its reference is ${escapeHtml(noticeId)}.`,
				"We will let you know at this address what we decided and how you can contest the decision.",
				"If you did not submit a notice to Lesefluss, someone entered your address by mistake; no further mail will follow unless we decide on that notice.",
			]),
		),
	};
}

// Channel-neutral: the same text goes into an inbox item, where "reply to this email" would not apply.
export const CONTEST_TEXT = `You can contest this decision by writing to ${NOTICES_TO}; a person will review it. You may also bring the matter before a court in your place of residence.`;

export const NOTICE_BASIS_TEXT =
	"This decision follows a notice we received. We do not share who submitted it.";

/** The plain-text statement of reasons (DSA Art. 17). Used for the inbox item and wrapped for the email. */
export function statementText(input: {
	what: string;
	duration: string;
	facts: string;
	rule: string;
}): string {
	return [
		`What we did: ${input.what}`,
		`How long: ${input.duration}`,
		`Why: ${input.facts}`,
		`Rule: ${input.rule} (${TERMS_URL})`,
		NOTICE_BASIS_TEXT,
		CONTEST_TEXT,
	].join("\n\n");
}

export function statementMail(text: string) {
	return {
		subject: "A decision about your Lesefluss account",
		html: wrap("Statement of reasons", paragraphs(text.split("\n\n").map(escapeHtml))),
		replyTo: NOTICES_TO,
	};
}

export function decisionText(outcome: "actioned" | "rejected"): string {
	return outcome === "actioned"
		? `We reviewed your notice and took action on the reported content or account. ${CONTEST_TEXT}`
		: `We reviewed your notice and decided not to act on it, because we did not find a violation of our terms or the law. ${CONTEST_TEXT}`;
}

export function decisionMail(noticeId: string, outcome: "actioned" | "rejected") {
	return {
		subject: "Our decision on your notice",
		html: wrap(
			"Decision on your notice",
			paragraphs([`Reference: ${escapeHtml(noticeId)}`, escapeHtml(decisionText(outcome))]),
		),
		replyTo: NOTICES_TO,
	};
}
