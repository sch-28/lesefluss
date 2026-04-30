import type React from "react";
import { useEffect, useRef } from "react";
import type { RsvpViewHandle } from "./rsvp-view";
import type { ReaderViewHandle } from "./view-types";

const WPM_STEP = 25;
const SCROLL_FRACTION = 0.25;
const INTERACTIVE_SELECTOR = [
	"a",
	"button",
	"input",
	"select",
	"textarea",
	"[contenteditable=true]",
	"[role=button]",
	"ion-button",
	"ion-modal",
	"ion-popover",
	"ion-action-sheet",
].join(",");

const ACTIVE_OVERLAY_SELECTOR =
	"ion-modal.show-modal, ion-popover.show-popover, ion-action-sheet.show-action-sheet";

type Options = {
	readerMode: "standard" | "rsvp";
	paginationStyle: string;
	currentWpm: number;
	isBlocked: boolean;
	scrollViewRef: React.RefObject<ReaderViewHandle | null>;
	rsvpViewRef: React.RefObject<RsvpViewHandle | null>;
	lastOffsetRef: React.RefObject<number | null>;
	handleRsvpToggle: () => void;
	exitRsvpToStandard: (offset: number) => void;
};

export function useKeyboardShortcuts({
	readerMode,
	paginationStyle,
	currentWpm,
	isBlocked,
	scrollViewRef,
	rsvpViewRef,
	lastOffsetRef,
	handleRsvpToggle,
	exitRsvpToStandard,
}: Options) {
	const handlerRef = useRef<(e: KeyboardEvent) => void>(() => {});

	handlerRef.current = (e: KeyboardEvent) => {
		if (e.defaultPrevented) return;
		const target = e.target instanceof Element ? e.target : null;
		if (target?.closest(INTERACTIVE_SELECTOR)) return;
		if (document.querySelector(ACTIVE_OVERLAY_SELECTOR)) return;

		if (isBlocked) return;

		if (e.key === "r" && !e.ctrlKey && !e.metaKey) {
			e.preventDefault();
			handleRsvpToggle();
			return;
		}

		if (readerMode === "rsvp") {
			switch (e.key) {
				case " ":
					e.preventDefault();
					rsvpViewRef.current?.togglePlayPause();
					break;
				case "ArrowRight":
					e.preventDefault();
					if (e.ctrlKey || e.metaKey) rsvpViewRef.current?.forwardSentence();
					else rsvpViewRef.current?.forwardWord();
					break;
				case "ArrowLeft":
					e.preventDefault();
					if (e.ctrlKey || e.metaKey) rsvpViewRef.current?.backSentence();
					else rsvpViewRef.current?.backWord();
					break;
				case "ArrowUp":
					e.preventDefault();
					rsvpViewRef.current?.changeWpm(currentWpm + WPM_STEP);
					break;
				case "ArrowDown":
					e.preventDefault();
					rsvpViewRef.current?.changeWpm(currentWpm - WPM_STEP);
					break;
				case "Escape":
					e.preventDefault();
					exitRsvpToStandard(lastOffsetRef.current ?? 0);
					break;
			}
		} else if (paginationStyle === "page") {
			switch (e.key) {
				case "ArrowRight":
				case " ":
					e.preventDefault();
					scrollViewRef.current?.goNext?.();
					break;
				case "ArrowLeft":
					e.preventDefault();
					scrollViewRef.current?.goPrev?.();
					break;
			}
		} else {
			switch (e.key) {
				case " ":
				case "ArrowDown":
				case "PageDown":
					e.preventDefault();
					scrollViewRef.current?.scrollBy?.(window.innerHeight * SCROLL_FRACTION);
					break;
				case "ArrowUp":
				case "PageUp":
					e.preventDefault();
					scrollViewRef.current?.scrollBy?.(-window.innerHeight * SCROLL_FRACTION);
					break;
			}
		}
	};

	useEffect(() => {
		const handler = (e: KeyboardEvent) => handlerRef.current(e);
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, []);
}
