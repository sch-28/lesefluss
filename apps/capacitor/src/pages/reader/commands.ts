import type { PaginationStyle } from "@lesefluss/core";
import type React from "react";
import type { Command } from "../../commands/registry";
import type { Chapter } from "../../services/db/schema";
import type { RsvpViewHandle } from "./rsvp-view";
import { isFullscreenEscape } from "./use-fullscreen";
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
			// The Esc that leaves fullscreen pauses RSVP but stays in it (LESE-65.4 decision 4b8ee366).
			when: () => inRsvp() && !isFullscreenEscape(),
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
	readAloud: {
		title: string;
		isReady: boolean;
		toggle: () => void;
		/** Set while the view has left the word being spoken. */
		backToVoice: (() => void) | null;
	} | null;
	chapters: readonly Chapter[];
	goToWord: (word: number) => void;
	bookmarks: {
		isOnScreen: boolean;
		toggle: () => void;
		goToNext: () => void;
		/** In reading order; `name` is the label or the first words. */
		list: readonly { id: string; word: number; name: string }[];
	};
	openBookDetails: () => void;
	/** Null where the platform has no fullscreen (the Android app). */
	fullscreen: { isOn: boolean; toggle: () => void; exit: () => void } | null;
};

/** Reader actions for the palette; most have no key of their own. */
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
			keywords: ["annotations", "toc", "chapters", "bookmarks", "glossary", "notes"],
			scope: "reader",
			when: hasContent,
			run: input.openAnnotations,
		},
		{
			id: "reader.bookmark",
			title: input.bookmarks.isOnScreen ? "Remove bookmark here" : "Bookmark here",
			keywords: ["ribbon", "mark"],
			scope: "reader",
			keys: ["b"],
			when: hasContent,
			run: input.bookmarks.toggle,
		},
		{
			id: "reader.bookmark.next",
			title: "Next bookmark",
			keywords: ["bookmarks", "jump"],
			scope: "reader",
			keys: ["Shift+B"],
			when: () => hasContent() && input.bookmarks.list.length > 0,
			run: input.bookmarks.goToNext,
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
	const fullscreen = input.fullscreen;
	if (fullscreen) {
		commands.push(
			{
				id: "reader.fullscreen",
				title: fullscreen.isOn ? "Leave fullscreen" : "Fullscreen",
				keywords: ["full screen", "distraction", "focus"],
				scope: "reader",
				keys: ["f"],
				run: fullscreen.toggle,
			},
			{
				// Where the browser hands the page its Escape instead of leaving fullscreen itself.
				id: "reader.fullscreen-exit",
				title: "Leave fullscreen",
				scope: "reader",
				keys: ["Escape"],
				when: () => fullscreen.isOn,
				inControls: true,
				isHiddenInPalette: true,
				run: fullscreen.exit,
			},
		);
	}
	const readAloud = input.readAloud;
	if (readAloud) {
		const { backToVoice } = readAloud;
		commands.push(
			{
				id: "listen.toggle",
				title: readAloud.title,
				keywords: ["read aloud", "speech", "tts", "audio"],
				scope: "listen",
				keys: ["l"],
				when: () => readAloud.isReady,
				run: readAloud.toggle,
			},
			{
				id: "listen.back-to-voice",
				title: "Back to voice",
				keywords: ["read aloud", "follow"],
				scope: "listen",
				keys: ["v"],
				when: () => backToVoice !== null,
				run: () => backToVoice?.(),
			},
		);
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
	for (const bookmark of input.bookmarks.list) {
		commands.push({
			id: `reader.bookmark.go.${bookmark.id}`,
			title: `Go to bookmark: ${bookmark.name}`,
			keywords: ["bookmark"],
			scope: "reader",
			isSearchOnly: true,
			when: hasContent,
			run: () => input.goToWord(bookmark.word),
		});
	}
	return commands;
}
