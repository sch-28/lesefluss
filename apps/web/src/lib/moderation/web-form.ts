import type { NoticeTargetType } from "@lesefluss/core";

const FIELD_MESSAGES: Record<string, string> = {
	goodFaith: "Please confirm that your notice is made in good faith.",
	email: "Please enter a valid email address.",
	text: "Please describe the problem in at least 10 characters (2,000 at most).",
	location: "Please tell us where the content is.",
	name: "Please enter your name (letters only, no control characters).",
	reason: "Please pick a reason.",
	targetType: "Please pick what you are reporting.",
};

/** One message per field for the form; the schema decides, this only words it. */
export function fieldErrors(
	issues: { path: PropertyKey[]; message: string }[],
): Record<string, string> {
	const out: Record<string, string> = {};
	for (const issue of issues) {
		const field = String(issue.path[0] ?? "form");
		out[field] ??= FIELD_MESSAGES[field] ?? issue.message;
	}
	return out;
}

/** What the public form and the app show for each target type; the server registry holds the behaviour. */
export const NOTICE_TARGET_LABELS: Record<NoticeTargetType, { label: string; hint: string }> = {
	profile: { label: "A user's profile", hint: "The handle, for example @booklover" },
	shared_book: {
		label: "A shared book",
		hint: "The sender's handle and the book title, for example @booklover, Moby-Dick",
	},
	buddy_read_comment: {
		label: "A comment in a buddy read",
		hint: "The author's handle and the book title; use the report button in the app for the exact comment",
	},
	buddy_read_highlight: {
		label: "A highlight shared in a buddy read",
		hint: "The author's handle and the book title; use the report button in the app for the exact highlight",
	},
};
