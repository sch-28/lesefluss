import { z } from "zod";
import { FINISHED_PERCENT_THRESHOLD } from "./books";

export const HANDLE_MIN_LENGTH = 3;
export const HANDLE_MAX_LENGTH = 20;
export const DISPLAY_NAME_MAX_LENGTH = 50;
export const BIO_MAX_LENGTH = 160;
export const HANDLE_CHANGE_COOLDOWN_DAYS = 30;
export const HANDLE_RELEASE_HOLD_DAYS = 90;
export const AVATAR_MAX_BYTES = 5_000_000;
export const AVATAR_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const PROFILE_VISIBILITIES = ["private", "friends"] as const;
export type ProfileVisibility = (typeof PROFILE_VISIBILITIES)[number];

// Validated on the raw input so Unicode that lowercases into ASCII (the Kelvin
// sign, fullwidth letters) never turns into a valid handle.
const HANDLE_RAW_CHARS = /^[A-Za-z0-9_]+$/;
// Control characters plus the bidi embedding/override/isolate marks, which let a
// name render other text backwards.
const FORBIDDEN_TEXT_CHARS = /[\p{Cc}؜‎‏‪-‮⁦-⁩]/u;

export type TextValidationReason = "too_short" | "too_long" | "invalid_chars" | "control_chars";
export type TextValidation = { ok: true } | { ok: false; reason: TextValidationReason };

export function validateHandle(raw: string): TextValidation {
	if (raw.length < HANDLE_MIN_LENGTH) return { ok: false, reason: "too_short" };
	if (raw.length > HANDLE_MAX_LENGTH) return { ok: false, reason: "too_long" };
	if (!HANDLE_RAW_CHARS.test(raw)) return { ok: false, reason: "invalid_chars" };
	return { ok: true };
}

export function normalizeHandle(raw: string): string {
	return raw.toLowerCase();
}

function validateText(value: string, max: number, min: number): TextValidation {
	if (FORBIDDEN_TEXT_CHARS.test(value)) return { ok: false, reason: "control_chars" };
	const length = [...value].length;
	if (length < min) return { ok: false, reason: "too_short" };
	if (length > max) return { ok: false, reason: "too_long" };
	return { ok: true };
}

/** Expects an already trimmed value. */
export function validateDisplayName(value: string): TextValidation {
	return validateText(value, DISPLAY_NAME_MAX_LENGTH, 1);
}

/** Expects an already trimmed value; empty means no bio. */
export function validateBio(value: string): TextValidation {
	return validateText(value, BIO_MAX_LENGTH, 0);
}

const handleField = z.string().refine((raw) => validateHandle(raw).ok, "Invalid handle");
const displayNameField = z
	.string()
	.trim()
	.refine((value) => validateDisplayName(value).ok, "Invalid display name");
const bioField = z
	.string()
	.trim()
	.refine((value) => validateBio(value).ok, "Invalid bio");

export const CheckHandleBodySchema = z.object({ handle: handleField });
export const ClaimHandleBodySchema = z.object({ handle: handleField, name: displayNameField });
export const UpdateSocialProfileBodySchema = z.object({
	name: displayNameField.optional(),
	bio: bioField.optional(),
	visibility: z.enum(PROFILE_VISIBILITIES).optional(),
	showCurrentlyReading: z.boolean().optional(),
	showFinished: z.boolean().optional(),
	showStats: z.boolean().optional(),
	showHighlights: z.boolean().optional(),
});
export const AvatarSourceBodySchema = z.object({ source: z.enum(["account", "none"]) });

export type ClaimHandleBody = z.infer<typeof ClaimHandleBodySchema>;
export type UpdateSocialProfileBody = z.infer<typeof UpdateSocialProfileBodySchema>;
export type AvatarSourceBody = z.infer<typeof AvatarSourceBodySchema>;

export type HandleUnavailableReason =
	| "invalid"
	| "reserved"
	| "taken"
	| "cooldown"
	| "rate_limited";

export type HandleAvailability =
	| { available: true }
	| { available: false; reason: HandleUnavailableReason; retryAfterDays?: number };

/** What the owner sees of their own social profile. Never carries email or role. */
export type OwnSocialProfile = {
	userId: string;
	handle: string | null;
	/** Unix ms of the last handle claim, null before the first one. */
	handleChangedAt: number | null;
	name: string;
	bio: string | null;
	avatarUrl: string | null;
	/** Whether the sign-in provider supplied a picture the user may adopt. */
	hasAccountPicture: boolean;
	visibility: ProfileVisibility;
	showCurrentlyReading: boolean;
	showFinished: boolean;
	showStats: boolean;
	showHighlights: boolean;
};

export function initialsFor(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	const first = parts[0]?.[0] ?? "";
	const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
	return (first + last).toUpperCase() || "?";
}

export function isProfileVisibility(value: string): value is ProfileVisibility {
	return (PROFILE_VISIBILITIES as readonly string[]).includes(value);
}

/** Error body of every `/api/social/*` rejection. */
export const SocialErrorBodySchema = z.object({
	reason: z.string().optional(),
	retryAfterDays: z.number().optional(),
});
export type SocialErrorBody = z.infer<typeof SocialErrorBodySchema>;

export function parseSocialErrorBody(body: unknown): SocialErrorBody {
	const parsed = SocialErrorBodySchema.safeParse(body);
	return parsed.success ? parsed.data : {};
}

export type HandleClaimFailure = HandleUnavailableReason | "offline";

/** Maps a rejected `/api/social/*` response to what the claim step shows inline. */
export function handleClaimFailure(status: number, reason: string | undefined): HandleClaimFailure {
	if (status === 429 && reason !== "cooldown") return "rate_limited";
	switch (reason) {
		case "invalid":
		case "reserved":
		case "taken":
		case "cooldown":
			return reason;
		default:
			return "offline";
	}
}

export function handleClaimFailureMessage(reason: HandleClaimFailure, days?: number): string {
	switch (reason) {
		case "invalid":
			return `${HANDLE_MIN_LENGTH} to ${HANDLE_MAX_LENGTH} letters, digits or underscores.`;
		case "reserved":
			return "This handle is reserved.";
		case "taken":
			return "This handle is taken.";
		case "cooldown":
			return days
				? `You can change your handle again in ${days} day${days === 1 ? "" : "s"}.`
				: "You changed your handle recently.";
		case "rate_limited":
			return "Too many attempts. Try again in a minute.";
		case "offline":
			return "Can't reach the server. Check your connection.";
	}
}

export function avatarErrorMessage(reason: string | undefined): string {
	switch (reason) {
		case "too_large":
			return "The image is larger than 5 MB.";
		case "unsupported_image":
			return "Use a JPEG, PNG or WebP image.";
		case "rate_limited":
			return "Too many uploads. Try again later.";
		case "fetch_failed":
			return "Couldn't fetch your account picture.";
		case "no_account_picture":
			return "Your account has no picture we can use.";
		default:
			return "Couldn't update the avatar.";
	}
}

export function textValidationMessage(kind: "name" | "bio", reason: TextValidationReason): string {
	switch (reason) {
		case "too_short":
			return "Enter a display name.";
		case "too_long":
			return `At most ${kind === "name" ? DISPLAY_NAME_MAX_LENGTH : BIO_MAX_LENGTH} characters.`;
		default:
			return "Contains characters that aren't allowed.";
	}
}

/** Debounce for the availability check while the user types a handle. */
export const HANDLE_CHECK_DEBOUNCE_MS = 400;

/** State of the availability check in the claim step. */
export type HandleCheckState =
	| { state: "checking" }
	| { state: "available" }
	| { state: "unavailable"; reason: HandleClaimFailure; retryAfterDays?: number };

export const FRIEND_REQUEST_TTL_DAYS = 30;
export const DECLINE_COOLDOWN_DAYS = 90;
export const INVITE_TTL_DAYS = 14;
export const MAX_PENDING_OUTGOING_REQUESTS = 100;
export const MAX_FRIENDS = 1000;

export const FRIEND_REQUEST_STATES = ["pending", "accepted", "declined", "cancelled"] as const;
export type FriendRequestState = (typeof FRIEND_REQUEST_STATES)[number];

const userIdField = z.string().min(1).max(100);
const uuidField = z.string().uuid();

export const UserIdBodySchema = z.object({ userId: userIdField });
export const RespondToRequestBodySchema = z.object({
	requestId: uuidField,
	action: z.enum(["accept", "decline", "decline_block"]),
});
export const RequestIdBodySchema = z.object({ requestId: uuidField });
export const InviteTokenBodySchema = z.object({ token: z.string().min(1).max(200) });

export type UserIdBody = z.infer<typeof UserIdBodySchema>;
export type RespondToRequestBody = z.infer<typeof RespondToRequestBodySchema>;
export type RequestIdBody = z.infer<typeof RequestIdBodySchema>;
export type InviteTokenBody = z.infer<typeof InviteTokenBodySchema>;

/** The identity card of another user, plus the id every social endpoint keys on. */
export type SocialIdentity = {
	userId: string;
	handle: string;
	name: string;
	avatarUrl: string | null;
};

/** What the caller's side of a relationship looks like. */
export type RelationshipState = "none" | "pending_outgoing" | "pending_incoming" | "friends";

export type SocialRelationships = {
	friends: (SocialIdentity & { since: number })[];
	incoming: (SocialIdentity & { requestId: string; sentAt: number })[];
	outgoing: (SocialIdentity & { requestId: string; sentAt: number })[];
	blocked: SocialIdentity[];
};

export type InviteInfo = { url: string; expiresAt: number };

export type InvitePreviewState =
	| "valid"
	| "own"
	| "already_friends"
	| "invalid"
	| "signed_out"
	| "handle_required";

export type InvitePreview = {
	state: InvitePreviewState;
	/** Present unless the link is invalid. */
	owner?: SocialIdentity;
};

/** Paths of the social API, shared by the app and the website clients. */
export const SOCIAL_API = {
	profile: "/api/social/profile",
	handle: "/api/social/handle",
	handleCheck: "/api/social/handle-check",
	avatar: "/api/social/avatar",
	avatarSource: "/api/social/avatar-source",
	relationships: "/api/social/relationships",
	friendRequest: "/api/social/friend-request",
	friendRequestRespond: "/api/social/friend-request-respond",
	friendRequestCancel: "/api/social/friend-request-cancel",
	friendRemove: "/api/social/friend-remove",
	block: "/api/social/block",
	unblock: "/api/social/unblock",
	invite: "/api/social/invite",
	inviteRevoke: "/api/social/invite-revoke",
	invitePreview: "/api/social/invite-preview",
	inviteRedeem: "/api/social/invite-redeem",
	inbox: "/api/social/inbox",
	inboxUnreadCount: "/api/social/inbox-unread-count",
	inboxRead: "/api/social/inbox-read",
	inboxReadAll: "/api/social/inbox-read-all",
	profileView: "/api/social/profile-view",
	coverImage: "/api/social/cover-image",
	report: "/api/social/report",
	share: "/api/social/share",
	shareRevoke: "/api/social/share-revoke",
	shareRespond: "/api/social/share-respond",
	sharesForBook: "/api/social/shares-for-book",
	buddyReadCreate: "/api/social/buddy-read",
	buddyReadInvite: "/api/social/buddy-read-invite",
	buddyReadInviteCancel: "/api/social/buddy-read-invite-cancel",
	buddyReadInviteRespond: "/api/social/buddy-read-invite-respond",
	buddyReadLeave: "/api/social/buddy-read-leave",
	buddyReadRemoveMember: "/api/social/buddy-read-remove-member",
	buddyReadTargetDate: "/api/social/buddy-read-target-date",
	buddyReads: "/api/social/buddy-reads",
	buddyReadDetail: "/api/social/buddy-read-detail",
	buddyReadProgress: "/api/social/buddy-read-progress",
	buddyReadDiscussion: "/api/social/buddy-read-discussion",
	buddyReadComment: "/api/social/buddy-read-comment",
	buddyReadCommentReply: "/api/social/buddy-read-comment-reply",
	buddyReadCommentEdit: "/api/social/buddy-read-comment-edit",
	buddyReadCommentDelete: "/api/social/buddy-read-comment-delete",
	buddyReadHighlightShare: "/api/social/buddy-read-highlight-share",
	buddyReadHighlightUnshare: "/api/social/buddy-read-highlight-unshare",
	buddyReadReaction: "/api/social/buddy-read-reaction",
	buddyReadReactionRemove: "/api/social/buddy-read-reaction-remove",
	buddyReadDiscussionSettings: "/api/social/buddy-read-discussion-settings",
} as const;

/** User-facing copy for a rejected friend, block or invite action. */
export function socialActionErrorMessage(reason: string | undefined): string {
	switch (reason) {
		case "rate_limited":
			return "Too many requests. Try again later.";
		case "limit_reached":
			return "Limit reached. Remove some pending requests or friends first.";
		case "not_found":
			return "This user is not available.";
		case "handle_required":
			return "Pick a handle first.";
		default:
			return "Something went wrong. Please try again.";
	}
}

export const INBOX_READ_RETENTION_DAYS = 90;
export const INBOX_MAX_AGE_DAYS = 365;
export const INBOX_PAGE_SIZE = 30;

/**
 * Inbox item types. Each feature appends its own here; the table needs no
 * change. Rules for every type, present and future:
 * - Nothing the other side keeps silent may surface: no type for a declined
 *   request, a removed friend or a block, and a report outcome never names the
 *   reporter.
 * - The actor is resolved live from their profile when listed, never copied
 *   into the row.
 * - Actionable types derive their state from the subject row when listed, so a
 *   request resolved elsewhere shows as resolved and offers no action.
 * Push delivery (a later feature) maps these types to notification categories.
 */
export const NOTIFICATION_TYPES = [
	"friend_request_received",
	"friend_request_accepted",
	"friend_joined_via_invite",
	"statement_of_reasons",
	"notice_decision",
	"share_received",
	"share_accepted",
	"share_removed",
	"buddy_read_invite",
	"buddy_read_joined",
	"buddy_read_finished",
	"buddy_read_reply",
	"buddy_read_reaction",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export function isNotificationType(value: string): value is NotificationType {
	return (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

/** A cancelled, expired or unfriended request has no item; a resolved one keeps it as read. */
export type FriendRequestItemState = "pending" | "accepted" | "declined";

/** `unavailable` covers every reason a share can no longer be taken (expired, source gone, suspension, takedown, unfriended) without naming it. */
export type ShareItemState = "pending" | "accepted" | "declined" | "unavailable";

export type ShareItemBook = {
	title: string;
	author: string | null;
	wordCount: number | null;
	cover: ProfileCover;
};

export type BuddyReadInviteItemState = "pending" | "accepted" | "declined" | "unavailable";

export type InboxSubject =
	| { kind: "friend_request"; requestId: string; state: FriendRequestItemState }
	| { kind: "share"; shareId: string; state: ShareItemState; book: ShareItemBook }
	| {
			kind: "buddy_read_invite";
			inviteId: string;
			buddyReadId: string;
			state: BuddyReadInviteItemState;
			book: { title: string; author: string | null };
			/** Null when the host is hidden from the invitee. */
			host: SocialIdentity | null;
			participants: SocialIdentity[];
	  }
	| { kind: "buddy_read_discussion"; buddyReadId: string; title: string };

export type InboxItem = {
	id: string;
	/** A string, not the union: a client older than the server must be able to skip unknown types. */
	type: string;
	createdAt: number;
	readAt: number | null;
	/** Null when Lesefluss itself is the sender (moderation items). */
	actor: SocialIdentity | null;
	subject: InboxSubject | null;
	/** Server-composed text for items whose wording is decided when they are created. */
	payload: { text: string } | null;
};

export type InboxPage = { items: InboxItem[]; nextCursor: string | null };
export type UnreadCount = { count: number };

export const InboxItemIdBodySchema = z.object({ id: z.string().uuid() });
export type InboxItemIdBody = z.infer<typeof InboxItemIdBodySchema>;

/**
 * Profile sections and the visibility toggle each one hangs on. Later features
 * add a section here; the resolver treats the list as data.
 */
export const PROFILE_SECTIONS = {
	currentlyReading: "showCurrentlyReading",
	finished: "showFinished",
	stats: "showStats",
} as const satisfies Record<string, keyof OwnSocialProfile>;
export type ProfileSection = keyof typeof PROFILE_SECTIONS;

export type ProfileCover =
	| { kind: "catalog"; catalogId: string }
	| { kind: "url"; url: string }
	| null;

export type ProfileBook = {
	/** Book id, or the series id for a rolled-up serial. Never a URL and never a lookup key for other users. */
	key: string;
	title: string;
	author: string | null;
	progressPercent: number;
	cover: ProfileCover;
};

export type ProfileFinishedBook = {
	key: string;
	title: string;
	author: string | null;
	/** Calendar day (YYYY-MM-DD) in the owner's time zone, or null when unknown. */
	finishedOn: string | null;
	/** Half-stars, 1 to 10. */
	rating: number | null;
	cover: ProfileCover;
};

export type ProfileStats = {
	booksFinishedThisYear: number;
	wordsRead: number;
	/** Null when the owner has no synced sessions: missing data is not zero. */
	readingTimeMs: number | null;
	/** From `measuredReadingSpeed`, never the raw RSVP dial. Null like `readingTimeMs`. */
	readingSpeedWpm: number | null;
	/** Consecutive reading days in the owner's time zone, as the stats page counts them. Null like `readingTimeMs`. */
	currentStreakDays: number | null;
	longestStreakDays: number | null;
};

/** What a viewer may see of one profile; sections the owner hides are absent, not empty. */
export type ProfileView = {
	header: {
		identity: SocialIdentity;
		relation: "self" | "friend";
		friendsSince: number | null;
	};
	bio?: string | null;
	friendCount?: number;
	sections: {
		currentlyReading?: ProfileBook[];
		finished?: ProfileFinishedBook[];
		stats?: ProfileStats;
	};
};

export const NOTICE_REASONS = ["copyright", "harassment", "illegal", "spam", "other"] as const;
export type NoticeReason = (typeof NOTICE_REASONS)[number];
export const NOTICE_REASON_LABELS: Record<NoticeReason, string> = {
	copyright: "Copyright infringement",
	harassment: "Harassment or abuse",
	illegal: "Illegal content",
	spam: "Spam",
	other: "Something else",
};
export const NOTICE_TEXT_MAX_LENGTH = 2000;
export const NOTICE_TEXT_MIN_LENGTH = 10;

/** What a notice can point at. Later features register their own type server-side; the schema does not change. */
export const NOTICE_TARGET_TYPES = [
	"profile",
	"shared_book",
	"buddy_read_comment",
	"buddy_read_highlight",
] as const;
export type NoticeTargetType = (typeof NOTICE_TARGET_TYPES)[number];

const noticeText = z
	.string()
	.trim()
	.min(NOTICE_TEXT_MIN_LENGTH)
	.max(NOTICE_TEXT_MAX_LENGTH)
	.refine((value) => !FORBIDDEN_TEXT_CHARS.test(value), "Invalid characters");

/** In-app report of another user. `block` also blocks them in the same request. */
export const ReportBodySchema = z.object({
	targetType: z.enum(NOTICE_TARGET_TYPES),
	targetUserId: z.string().min(1).max(100),
	/**
	 * Per target type: for `shared_book`, the id of the share the reporter received;
	 * for `buddy_read_comment` the comment id, for `buddy_read_highlight` the shared-highlight id.
	 */
	subjectId: z.string().min(1).max(100).optional(),
	reason: z.enum(NOTICE_REASONS),
	text: noticeText,
	block: z.boolean().optional(),
});
export type ReportBody = z.infer<typeof ReportBodySchema>;

/** Public web form (DSA Art. 16): anyone, signed in or not. */
export const WebNoticeBodySchema = z.object({
	targetType: z.enum(NOTICE_TARGET_TYPES),
	location: z.string().trim().min(2).max(300),
	reason: z.enum(NOTICE_REASONS),
	text: noticeText,
	name: z
		.string()
		.trim()
		.min(2)
		.max(100)
		.refine((value) => !FORBIDDEN_TEXT_CHARS.test(value), "Invalid characters"),
	email: z.string().trim().toLowerCase().email().max(200),
	goodFaith: z.literal(true),
});
export type WebNoticeBody = z.infer<typeof WebNoticeBodySchema>;

export const SHARE_TTL_DAYS = 30;
export const SHARE_DAILY_LIMIT = 20;
export const SHARE_RECORD_RETENTION_DAYS = 90;

export const ShareBodySchema = z.object({
	recipientId: z.string().min(1).max(100),
	bookId: z.string().regex(/^[0-9a-f]{8}$/),
	/** The first share needs this true; afterwards it is ignored. */
	confirmRights: z.boolean().optional(),
});
export type ShareBody = z.infer<typeof ShareBodySchema>;

export const ShareIdBodySchema = z.object({ shareId: z.string().uuid() });
export const ShareRespondBodySchema = z.object({
	shareId: z.string().uuid(),
	action: z.enum(["accept", "decline"]),
});
export type ShareRespondBody = z.infer<typeof ShareRespondBodySchema>;

export type OutgoingShareState = "pending" | "expired";
export type OutgoingShare = {
	shareId: string;
	recipient: SocialIdentity;
	state: OutgoingShareState;
	createdAt: number;
};

/** User-facing copy for a refused share; the generic social messages cover the rest. */
export function shareErrorMessage(reason: string | undefined): string {
	switch (reason) {
		case "consent_required":
			return "Please confirm you have the right to share this book.";
		case "not_shareable":
			return "This book can't be shared. Only synced standalone books with content can be.";
		case "already_shared":
			return "You already shared this book with them.";
		case "suspended":
			return "Sharing is suspended for your account. Check your inbox for details.";
		case "unavailable":
			return "This share is no longer available.";
		case "limit_reached":
			return "You reached today's sharing limit. Try again tomorrow.";
		default:
			return socialActionErrorMessage(reason);
	}
}

export const BUDDY_READ_MAX_PARTICIPANTS = 8;
export const BUDDY_READ_INVITE_TTL_DAYS = 30;
export const BUDDY_READ_PROGRESS_REFRESH_MS = 60_000;

const bookIdField = z.string().regex(/^[0-9a-f]{8}$/);
const inviteeIds = z.array(userIdField).max(BUDDY_READ_MAX_PARTICIPANTS - 1);

export const CreateBuddyReadBodySchema = z.object({
	bookId: bookIdField,
	inviteeIds: inviteeIds.optional().default([]),
});
export type CreateBuddyReadBody = z.infer<typeof CreateBuddyReadBodySchema>;
export const BuddyReadInviteBodySchema = z.object({ buddyReadId: uuidField, inviteeIds });
export const BuddyReadIdBodySchema = z.object({ buddyReadId: uuidField });
export const BuddyReadInviteIdBodySchema = z.object({ inviteId: uuidField });
export const BuddyReadInviteRespondBodySchema = z.object({
	inviteId: uuidField,
	action: z.enum(["accept", "decline"]),
});
export const BuddyReadRemoveMemberBodySchema = z.object({
	buddyReadId: uuidField,
	userId: userIdField,
});
export const BuddyReadTargetDateBodySchema = z.object({
	buddyReadId: uuidField,
	targetDate: z.number().int().nonnegative().nullable(),
});

export type BuddyReadStatus = "in_progress" | "finished";

export type BuddyReadSummary = {
	id: string;
	/** Matches the local book's `originKey`, so the app finds the book without ids it does not have. */
	originKey: string;
	title: string;
	author: string | null;
	status: BuddyReadStatus;
	/** Null when the host is hidden from the viewer (a block or a ban). */
	host: SocialIdentity | null;
	memberCount: number;
	pendingInvites: number;
	targetDate: number | null;
	/** The viewer's own linked book. */
	myBookId: string;
	createdAt: number;
	finishedAt: number | null;
	/** The book was taken down; progress and discussion are gone. */
	originUnavailable: boolean;
	/** Current members the viewer may see, the viewer included; empty after a takedown. */
	members: BuddyReadMemberPreview[];
};

export type BuddyReadMemberPreview = {
	identity: SocialIdentity;
	isSelf: boolean;
	percent: number | null;
	finished: boolean;
};

export type BuddyReadParticipant = {
	identity: SocialIdentity;
	isSelf: boolean;
	isHost: boolean;
	isFriend: boolean;
	relationship: RelationshipState;
	/** Null when the row has no word count yet. */
	percent: number | null;
	wordPosition: number;
	wordCount: number | null;
	lastActiveAt: number | null;
	finishedAt: number | null;
};

export type BuddyReadInviteSummary = {
	inviteId: string;
	invitee: SocialIdentity;
	createdAt: number;
};

export type BuddyReadDetail = BuddyReadSummary & {
	isHost: boolean;
	/** Participants' word counts differ, so words ahead or behind would mislead. */
	approximate: boolean;
	participants: BuddyReadParticipant[];
	/** Pending invites, for the host only. */
	invites: BuddyReadInviteSummary[];
};

export type BuddyReadProgress = {
	approximate: boolean;
	participants: {
		userId: string;
		name: string;
		handle: string;
		wordPosition: number;
		wordCount: number | null;
		percent: number | null;
	}[];
};

/** Whether a member is on pace for the target date: percent at least the elapsed share of the schedule. */
export function isOnPace(input: {
	percent: number | null;
	createdAt: number;
	targetDate: number | null;
	now: number;
}): boolean | null {
	if (input.percent === null || input.targetDate === null) return null;
	if (input.targetDate <= input.createdAt) return input.percent >= FINISHED_PERCENT_THRESHOLD;
	const elapsed = (input.now - input.createdAt) / (input.targetDate - input.createdAt);
	// Whole percents on both sides: minutes into a long schedule, 0% is on pace.
	return input.percent >= Math.floor(Math.min(100, Math.max(0, elapsed) * 100));
}

export function buddyReadErrorMessage(reason: string | undefined): string {
	switch (reason) {
		case "full":
			return "This buddy read is full (8 people including the host).";
		case "already_member":
			return "They are already part of this buddy read.";
		case "not_host":
			return "Only the host can do that.";
		case "not_shareable":
			return "Only synced standalone books with content can be read together.";
		case "unavailable":
			return "This invite is no longer available.";
		case "suspended":
			return "Sharing is suspended for your account. Check your inbox for details.";
		default:
			return socialActionErrorMessage(reason);
	}
}

export const BUDDY_COMMENT_MAX_CHARS = 2000;
export const BUDDY_COMMENT_RATE_LIMIT = { max: 30, windowMs: 10 * 60_000 } as const;
export const BUDDY_REACTION_RATE_LIMIT = { max: 120, windowMs: 10 * 60_000 } as const;
export const BUDDY_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥"] as const;
export type BuddyReaction = (typeof BUDDY_REACTIONS)[number];

const wordField = z.number().int().nonnegative();
const charField = z.number().int().nonnegative().max(10_000);

export const DiscussionAnchorSchema = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("range"),
		startWord: wordField,
		startCharInWord: charField.default(0),
		endWord: wordField,
		endCharInWord: charField.default(0),
	}),
	z.object({ kind: z.literal("chapter"), startWord: wordField }),
]);
export type DiscussionAnchor = z.infer<typeof DiscussionAnchorSchema>;

const commentBody = z
	.string()
	.transform((value) => value.replace(/\r\n?/g, "\n").trim())
	.pipe(z.string().min(1).max(BUDDY_COMMENT_MAX_CHARS))
	// Line breaks are the one kind of control character a comment may hold.
	.refine(
		(value) => !FORBIDDEN_TEXT_CHARS.test(value.replace(/[\n\t]/g, "")),
		"Invalid characters",
	);

export const PostCommentBodySchema = z.object({
	buddyReadId: uuidField,
	anchor: DiscussionAnchorSchema,
	body: commentBody,
});
export const ReplyCommentBodySchema = z.object({ parentId: uuidField, body: commentBody });
export const EditCommentBodySchema = z.object({ commentId: uuidField, body: commentBody });
export const CommentIdBodySchema = z.object({ commentId: uuidField });
export const ShareHighlightBodySchema = z.object({
	buddyReadId: uuidField,
	highlightId: z.string().min(1).max(100),
});
export const SharedHighlightIdBodySchema = z.object({ sharedHighlightId: uuidField });
export const ReactionBodySchema = z
	.object({
		commentId: uuidField.optional(),
		sharedHighlightId: uuidField.optional(),
		emoji: z.enum(BUDDY_REACTIONS),
	})
	.refine((b) => Boolean(b.commentId) !== Boolean(b.sharedHighlightId), "One target");
export const DiscussionSettingsBodySchema = z.object({
	buddyReadId: uuidField,
	shareAllHighlights: z.boolean().optional(),
	showEverything: z.boolean().optional(),
});

export type ReactionSummary = { emoji: BuddyReaction; count: number; mine: boolean };

type DiscussionItemBase = {
	id: string;
	/** Null once the author's account is gone or the comment was removed. */
	author: SocialIdentity | null;
	isOwn: boolean;
	startWord: number;
	endWord: number;
	createdAt: number;
	reactions: ReactionSummary[];
};

export type DiscussionReply = DiscussionItemBase & {
	body: string | null;
	editedAt: number | null;
	removed: boolean;
};

export type DiscussionComment = DiscussionItemBase & {
	kind: "comment";
	anchorKind: "range" | "chapter";
	startCharInWord: number;
	endCharInWord: number;
	body: string | null;
	editedAt: number | null;
	/** Deleted by its author or taken down, kept because it has replies. */
	removed: boolean;
	replies: DiscussionReply[];
};

export type DiscussionHighlight = DiscussionItemBase & {
	kind: "highlight";
	text: string;
	note: string | null;
	color: string;
};

export type DiscussionItem = DiscussionComment | DiscussionHighlight;

export type DiscussionPage = {
	items: DiscussionItem[];
	/** Items anchored past the viewer's furthest position, from people the viewer may see. */
	hiddenAhead: number;
	furthestWord: number;
	showEverything: boolean;
	shareAllHighlights: boolean;
};

export function discussionErrorMessage(reason: string | undefined): string {
	switch (reason) {
		case "invalid_anchor":
			return "That place is not in this book.";
		case "highlight_not_synced":
			return "This highlight has not reached the cloud yet. Sync, then try again.";
		case "highlight_no_text":
			return "This highlight has no stored text yet. Sync, then try again.";
		case "share_all_on":
			return "Turn off Share all my highlights to unshare single highlights.";
		case "highlight_removed":
			return "This highlight was removed after a report and cannot be shared again.";
		case "rate_limited":
			return "You're doing that a lot. Try again in a few minutes.";
		default:
			return buddyReadErrorMessage(reason);
	}
}
