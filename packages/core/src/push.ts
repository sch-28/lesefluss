import { z } from "zod";
import type { NotificationType } from "./social";

export const PUSH_API = {
	register: "/api/push/register",
	preferences: "/api/push/preferences",
} as const;

export const PUSH_PLATFORMS = ["android", "ios"] as const;
export type PushPlatform = (typeof PUSH_PLATFORMS)[number];

export function isPushPlatform(value: string): value is PushPlatform {
	return (PUSH_PLATFORMS as readonly string[]).includes(value);
}

export const PushRegisterBodySchema = z.object({
	token: z.string().min(1).max(4096),
	platform: z.enum(PUSH_PLATFORMS),
});
export type PushRegisterBody = z.infer<typeof PushRegisterBodySchema>;

/** Each inbox type that is pushed belongs to one category; an unlisted type stays inbox-only. */
export const PUSH_CATEGORY_TYPES = {
	friend_requests: ["friend_request_received", "friend_request_accepted"],
	shares: ["share_received", "share_accepted"],
	buddy_reads: ["buddy_read_invite", "buddy_read_joined", "buddy_read_finished"],
	discussion: ["buddy_read_reply", "buddy_read_reaction"],
} as const satisfies Record<string, readonly NotificationType[]>;

export type PushCategory = keyof typeof PUSH_CATEGORY_TYPES;
const PUSH_CATEGORIES = Object.keys(PUSH_CATEGORY_TYPES) as PushCategory[];

export function pushCategoryOf(type: string): PushCategory | null {
	for (const category of PUSH_CATEGORIES) {
		if ((PUSH_CATEGORY_TYPES[category] as readonly string[]).includes(type)) return category;
	}
	return null;
}

export type PushPreferences = Record<PushCategory, boolean> & { previews: boolean };

export const DEFAULT_PUSH_PREFERENCES: PushPreferences = {
	friend_requests: true,
	shares: true,
	buddy_reads: true,
	discussion: true,
	previews: true,
};

/** A partial update; omitted keys keep their stored value. */
export const PushPreferencesPatchSchema = z
	.object({
		friend_requests: z.boolean(),
		shares: z.boolean(),
		buddy_reads: z.boolean(),
		discussion: z.boolean(),
		previews: z.boolean(),
	})
	.partial()
	.strict();
export type PushPreferencesPatch = z.infer<typeof PushPreferencesPatchSchema>;

/** The Android channel every social push is posted to; the app creates it before registering. */
export const PUSH_CHANNEL_ID = "social";

/** What the app reads from a tapped push. */
export type PushData = { route: string; inboxItemId: string };

export const PUSH_PREVIEW_MAX_CHARS = 100;

/** The screens a push can open. The server builds the route, the app parses it back. */
export type PushLink =
	| { kind: "inbox" }
	| { kind: "buddy-read"; buddyReadId: string }
	| { kind: "buddy-read-discussion"; buddyReadId: string };

const INBOX_ROUTE = "/tabs/social/inbox";
const BUDDY_READ_ROUTE_PREFIX = {
	"buddy-read": "/tabs/social/buddy-read/",
	"buddy-read-discussion": "/tabs/social/buddy-read-discussion/",
} as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isPushUuid(value: string): boolean {
	return UUID_PATTERN.test(value);
}

export function pushRoute(link: PushLink): string {
	return link.kind === "inbox"
		? INBOX_ROUTE
		: `${BUDDY_READ_ROUTE_PREFIX[link.kind]}${link.buddyReadId}`;
}

/** Null for anything `pushRoute` would not have built, so a payload can never open an arbitrary path. */
export function parsePushRoute(route: string): PushLink | null {
	if (route === INBOX_ROUTE) return { kind: "inbox" };
	for (const kind of ["buddy-read", "buddy-read-discussion"] as const) {
		const prefix = BUDDY_READ_ROUTE_PREFIX[kind];
		if (!route.startsWith(prefix)) continue;
		const id = route.slice(prefix.length);
		return isPushUuid(id) ? { kind, buddyReadId: id } : null;
	}
	return null;
}
