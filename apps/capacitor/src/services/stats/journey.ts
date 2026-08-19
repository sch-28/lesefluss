import { daysBetweenLocal } from "../../utils/date-utils";

/**
 * The shape of one book's reading history: when it arrived, when it was
 * started, whether it is still going, and how long that took.
 *
 * Built from timestamps the app already records. Nothing here needs a new
 * column or a new query.
 */
export interface JourneyMilestone {
	label: string;
	at: number;
}

export interface Journey {
	milestones: JourneyMilestone[];
	/** Local days from the first sitting to the last, inclusive. Null until read. */
	spanDays: number | null;
	isFinished: boolean;
}

export interface JourneyInput {
	addedAt: number;
	finishedAt: number | null;
	firstReadAt: number | null;
	lastReadAt: number | null;
}

export function buildJourney(input: JourneyInput): Journey {
	const milestones: JourneyMilestone[] = [{ label: "Added", at: input.addedAt }];

	// A book imported and never opened has one milestone, not a fake "started".
	if (input.firstReadAt != null) milestones.push({ label: "Started", at: input.firstReadAt });

	if (input.finishedAt != null) {
		milestones.push({ label: "Finished", at: input.finishedAt });
	} else if (input.lastReadAt != null && input.lastReadAt !== input.firstReadAt) {
		milestones.push({ label: "Last read", at: input.lastReadAt });
	}

	// Measured to the finish when there is one: reopening a finished book later
	// should not stretch the span it took to read.
	//
	// A finish before the first sitting is reachable rather than hypothetical:
	// `backfillFinishedAt` falls back to `addedAt` for a book with no local
	// sessions, so a library restored from the server can carry a finish date from
	// before any local session exists. Measuring to it would report a week of
	// reading as one day, and would order the milestones backwards.
	const hasUsableFinish =
		input.finishedAt != null &&
		(input.firstReadAt == null || input.finishedAt >= input.firstReadAt);
	const end = hasUsableFinish ? input.finishedAt : input.lastReadAt;
	const spanDays =
		input.firstReadAt != null && end != null
			? Math.max(1, daysBetweenLocal(input.firstReadAt, end) + 1)
			: null;

	// Sorted rather than emitted in label order: the strip is drawn left to right
	// as a timeline, so a stamp older than the first sitting must not render last.
	milestones.sort((a, b) => a.at - b.at);

	return { milestones, spanDays, isFinished: input.finishedAt != null };
}
