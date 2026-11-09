import {
	MILESTONE_KINDS,
	type MilestoneKind,
	type NextMilestone,
	type ReachedMilestone,
} from "@lesefluss/core";

/** "640", "100k", "1.2M": short enough for the inside of a medal. */
export function compactNumber(n: number): string {
	if (n >= 1_000_000) return `${trimZero((n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1))}M`;
	if (n >= 10_000) return `${Math.floor(n / 1000)}k`;
	if (n >= 1000) return `${trimZero((n / 1000).toFixed(1))}k`;
	return String(Math.round(n));
}

function trimZero(s: string): string {
	return s.endsWith(".0") ? s.slice(0, -2) : s;
}

export type MilestoneFace = {
	value: string;
	caption: string;
	rsvp: boolean;
};

export function milestoneFace(kind: MilestoneKind, threshold: number): MilestoneFace {
	switch (kind) {
		case "words":
			return { value: compactNumber(threshold), caption: "words", rsvp: false };
		case "hours":
			return { value: `${compactNumber(threshold)}h`, caption: "hours", rsvp: false };
		case "books":
			return { value: String(threshold), caption: threshold === 1 ? "book" : "books", rsvp: false };
		case "streak":
			return { value: String(threshold), caption: "day streak", rsvp: false };
		case "rsvpWpm":
			return { value: String(threshold), caption: "wpm session", rsvp: true };
	}
}

/** "1.2M / 2M", "87h / 100h", "4 / 5". */
export function milestoneProgress(next: NextMilestone): string {
	const unit = next.kind === "hours" ? "h" : "";
	return `${compactNumber(next.current)}${unit} / ${compactNumber(next.threshold)}${unit}`;
}

export const MILESTONE_HUES: Record<MilestoneKind, { from: string; to: string }> = {
	words: { from: "#f3b45f", to: "#c94b2a" },
	hours: { from: "#f3b45f", to: "#c94b2a" },
	rsvpWpm: { from: "#7fd3ee", to: "#2a83b5" },
	streak: { from: "#f7d07a", to: "#d98a1c" },
	books: { from: "#8fd1a9", to: "#2f8a5c" },
};

export const milestoneKey = (m: ReachedMilestone | NextMilestone) => `${m.kind}-${m.threshold}`;

/** Drops kinds a newer server knows and this build does not, so an old app still renders a profile. */
export function knownMilestones(reached: readonly ReachedMilestone[] = []): ReachedMilestone[] {
	return reached.filter((m) => (MILESTONE_KINDS as readonly string[]).includes(m.kind));
}

/** "1 million words", "50 hours read", "100-day streak": a milestone as a list row names it. */
export function milestoneTitle(kind: MilestoneKind, threshold: number): string {
	switch (kind) {
		case "words":
			return threshold >= 1_000_000 && threshold % 1_000_000 === 0
				? `${threshold / 1_000_000} million words`
				: `${threshold.toLocaleString("en-US")} words`;
		case "hours":
			return `${threshold} ${threshold === 1 ? "hour" : "hours"} read`;
		case "books":
			return `${threshold} ${threshold === 1 ? "book" : "books"} finished`;
		case "streak":
			return `${threshold}-day streak`;
		case "rsvpWpm":
			return `${threshold} wpm RSVP sitting`;
	}
}

const PROGRESS_UNITS: Record<MilestoneKind, string> = {
	words: "",
	hours: " h",
	books: "",
	streak: " days",
	rsvpWpm: " wpm",
};

/** "88 of 100 h", "1.4M of 2M", "193 of 365 days". */
export function milestoneProgressLine(next: NextMilestone): string {
	return `${compactNumber(next.current)} of ${compactNumber(next.threshold)}${PROGRESS_UNITS[next.kind]}`;
}
