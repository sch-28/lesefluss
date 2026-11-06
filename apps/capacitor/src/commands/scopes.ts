export type CommandScope = "global" | "reader" | "library" | "rsvp" | "page" | "scroll" | "listen";

/** One label set for the palette and the shortcut sheet; page and scroll share a group. */
export const SCOPE_LABELS: Record<CommandScope, string> = {
	global: "Everywhere",
	reader: "Reader",
	library: "Library",
	rsvp: "RSVP",
	page: "Page and scroll",
	scroll: "Page and scroll",
	listen: "Listen",
};

export const SCOPE_ORDER: readonly CommandScope[] = [
	"reader",
	"rsvp",
	"page",
	"scroll",
	"listen",
	"library",
	"global",
];
