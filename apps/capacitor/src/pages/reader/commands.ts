import type { PaginationStyle } from "@lesefluss/core";
import type React from "react";
import type { Command } from "../../commands/registry";
import type { Chapter } from "../../services/db/schema";
import type { RsvpViewHandle } from "./rsvp-view";
import type { ReaderViewHandle } from "./view-types";

const SCROLL_FRACTION = 0.25;

export type ReaderKeyInput = {
	readerMode: "standard" | "rsvp";
	paginationStyle: PaginationStyle;
	isBlocked: boolean;
	scrollViewRef: React.RefObject<ReaderViewHandle | null>;
	rsvpViewRef: React.RefObject<RsvpViewHandle | null>;
	handleRsvpToggle: () => void;
	/** Exits at the word RSVP is showing. */
	exitRsvpToStandard: () => void;
	hasSelection: boolean;
	cancelSelection: () => void;
};

/** The reader's keyboard commands. Order matters: the first match per key press runs. */
export function readerKeyCommands(input: ReaderKeyInput): Command[] {
	const { readerMode, paginationStyle, scrollViewRef, rsvpViewRef } = input;
	const isFree = () => !input.isBlocked;
	const inRsvp = () => isFree() && readerMode === "rsvp";
	const inPage = () => isFree() && readerMode !== "rsvp" && paginationStyle === "page";
	const inScroll = () => isFree() && readerMode !== "rsvp" && paginationStyle !== "page";
	const rsvp = () => rsvpViewRef.current;
	const scrollBy = (sign: 1 | -1) =>
		scrollViewRef.current?.scrollBy?.(sign * window.innerHeight * SCROLL_FRACTION);

	return [
		{
			// Before anything else Escape could mean (leaving RSVP), and even with a toolbar button focused.
			id: "reader.dismiss-selection",
			title: "Clear selection",
			scope: "reader",
			keys: ["Escape"],
			when: () => input.hasSelection,
			inControls: true,
			isHiddenInPalette: true,
			run: input.cancelSelection,
		},
		{
			id: "reader.rsvp-toggle",
			title: readerMode === "rsvp" ? "Leave RSVP" : "Read with RSVP",
			keywords: ["speed reading", "mode"],
			scope: "reader",
			keys: ["r"],
			when: isFree,
			run: input.handleRsvpToggle,
		},
		{
			id: "rsvp.play",
			title: "Play or pause",
			scope: "rsvp",
			keys: ["Space"],
			when: inRsvp,
			run: () => rsvp()?.togglePlayPause(),
		},
		{
			id: "rsvp.next-word",
			title: "Next word",
			scope: "rsvp",
			keys: ["ArrowRight"],
			when: inRsvp,
			run: () => rsvp()?.forwardWord(),
		},
		{
			id: "rsvp.prev-word",
			title: "Previous word",
			scope: "rsvp",
			keys: ["ArrowLeft"],
			when: inRsvp,
			run: () => rsvp()?.backWord(),
		},
		{
			id: "rsvp.next-sentence",
			title: "Next sentence",
			scope: "rsvp",
			keys: ["Mod+ArrowRight"],
			when: inRsvp,
			run: () => rsvp()?.forwardSentence(),
		},
		{
			id: "rsvp.prev-sentence",
			title: "Previous sentence",
			scope: "rsvp",
			keys: ["Mod+ArrowLeft"],
			when: inRsvp,
			run: () => rsvp()?.backSentence(),
		},
		{
			id: "rsvp.faster",
			title: "Faster",
			keywords: ["speed", "wpm"],
			scope: "rsvp",
			keys: ["ArrowUp"],
			when: inRsvp,
			run: () => rsvp()?.stepWpm(1),
		},
		{
			id: "rsvp.slower",
			title: "Slower",
			keywords: ["speed", "wpm"],
			scope: "rsvp",
			keys: ["ArrowDown"],
			when: inRsvp,
			run: () => rsvp()?.stepWpm(-1),
		},
		{
			id: "rsvp.exit",
			title: "Leave RSVP here",
			scope: "rsvp",
			keys: ["Escape"],
			when: inRsvp,
			isHiddenInPalette: true,
			run: input.exitRsvpToStandard,
		},
		{
			id: "page.next",
			title: "Next page",
			scope: "page",
			keys: ["ArrowRight", "Space", "PageDown"],
			when: inPage,
			run: () => scrollViewRef.current?.goNext?.(),
		},
		{
			id: "page.prev",
			title: "Previous page",
			scope: "page",
			keys: ["ArrowLeft", "PageUp"],
			when: inPage,
			run: () => scrollViewRef.current?.goPrev?.(),
		},
		{
			id: "scroll.down",
			title: "Scroll down",
			scope: "scroll",
			keys: ["Space", "ArrowDown", "PageDown"],
			when: inScroll,
			run: () => scrollBy(1),
		},
		{
			id: "scroll.up",
			title: "Scroll up",
			scope: "scroll",
			keys: ["ArrowUp", "PageUp"],
			when: inScroll,
			run: () => scrollBy(-1),
		},
	];
}

export type ReaderActionInput = {
	hasContent: boolean;
	readerMode: "standard" | "rsvp";
	paginationStyle: PaginationStyle;
	/** E-ink locks the reader to pages. */
	canChangeLayout: boolean;
	setPaginationStyle: (style: PaginationStyle) => void;
	openSearch: () => void;
	openAppearance: () => void;
	openAnnotations: () => void;
	/** Null where the platform can't read aloud. */
	readAloud: { title: string; isReady: boolean; toggle: () => void } | null;
	chapters: readonly Chapter[];
	goToWord: (word: number) => void;
	openBookDetails: () => void;
};

/** Reader actions without a key of their own, for the palette. */
export function readerActionCommands(input: ReaderActionInput): Command[] {
	const hasContent = () => input.hasContent;
	const isStandard = () => input.hasContent && input.readerMode !== "rsvp";
	const commands: Command[] = [
		{
			id: "reader.search",
			title: "Search in book",
			keywords: ["find"],
			scope: "reader",
			when: hasContent,
			run: input.openSearch,
		},
		{
			id: "reader.appearance",
			title: "Appearance",
			keywords: ["font", "theme", "size", "margins"],
			scope: "reader",
			run: input.openAppearance,
		},
		{
			id: "reader.annotations",
			title: "Contents and highlights",
			keywords: ["annotations", "toc", "chapters", "glossary", "notes"],
			scope: "reader",
			when: hasContent,
			run: input.openAnnotations,
		},
		{
			id: "reader.layout",
			title: input.paginationStyle === "page" ? "Switch to scroll view" : "Switch to page view",
			keywords: ["pagination", "layout", "mode"],
			scope: "reader",
			when: () => isStandard() && input.canChangeLayout,
			run: () => input.setPaginationStyle(input.paginationStyle === "page" ? "scroll" : "page"),
		},
		{
			id: "reader.book-details",
			title: "Book details",
			keywords: ["info", "series"],
			scope: "reader",
			run: input.openBookDetails,
		},
	];
	const readAloud = input.readAloud;
	if (readAloud) {
		commands.push({
			id: "reader.read-aloud",
			title: readAloud.title,
			keywords: ["read aloud", "speech", "tts", "audio"],
			scope: "reader",
			when: () => readAloud.isReady,
			run: readAloud.toggle,
		});
	}
	input.chapters.forEach((chapter, index) => {
		commands.push({
			id: `reader.chapter.${index}`,
			title: `Go to: ${chapter.title}`,
			keywords: ["chapter"],
			scope: "reader",
			isSearchOnly: true,
			when: hasContent,
			run: () => input.goToWord(chapter.startWord),
		});
	});
	return commands;
}
