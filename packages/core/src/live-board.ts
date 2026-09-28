import { z } from "zod";
import type { ReadingMode } from "./reading-credit";

/** How often an open reader reports its position. */
export const LIVE_REPORT_INTERVAL_MS = 2_000;
/** A reader silent this long no longer counts as reading now; its next report starts a new sitting. */
export const LIVE_IDLE_MS = 30_000;
/** Speed is noise before a sitting has run this long. */
export const LIVE_MIN_SITTING_MS = 20_000;

/** The client's clock when it sent the action; orders a stop against that client's reports. Optional for older builds. */
const sentAtField = z.number().int().nonnegative().optional();

export const LiveActionBodySchema = z.discriminatedUnion("action", [
	z.object({
		action: z.literal("report"),
		buddyReadId: z.string().uuid(),
		position: z.number().int().nonnegative(),
		mode: z.enum(["rsvp", "scroll", "page"]),
		dialWpm: z.number().int().positive().max(10_000).nullable(),
		sentAt: sentAtField,
	}),
	z.object({ action: z.literal("stop"), buddyReadId: z.string().uuid(), sentAt: sentAtField }),
]);
export type LiveActionBody = z.infer<typeof LiveActionBodySchema>;
export type LiveReport = {
	position: number;
	mode: ReadingMode;
	dialWpm: number | null;
	sentAt?: number;
};

export type LiveMember = {
	userId: string;
	wordPosition: number;
	wordCount: number;
	/** Words per minute in the current sitting; null until it has run long enough. */
	wpm: number | null;
};

/**
 * One buddy read's live board as a viewer sees it: only members reading now,
 * never the viewer. `live` is false when the viewer has opted out, in which
 * case nothing live is shared either way.
 */
export type LiveSnapshot = {
	buddyReadId: string;
	live: boolean;
	members: LiveMember[];
};
