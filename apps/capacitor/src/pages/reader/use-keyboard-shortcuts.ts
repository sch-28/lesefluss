import type { PaginationStyle } from "@lesefluss/core";
import type React from "react";
import { useEffect, useRef } from "react";
import type { VolumeKeys } from "../../hooks/use-appearance-settings";
import {
	setVolumeKeysEnabled,
	subscribeVolumeKeys,
	type VolumeKey,
} from "../../services/volume-keys";
import type { RsvpViewHandle } from "./rsvp-view";
import type { ReaderViewHandle } from "./view-types";
import { clampWpm, WPM_STEP } from "./wpm";

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
const TEXT_FIELD_SELECTOR = "input, textarea, [contenteditable=true]";

/** Whether a key press is meant for the reader, not a control, a field or an open overlay. */
export function isReaderKey(e: KeyboardEvent): boolean {
	const target = e.target instanceof Element ? e.target : null;
	if (target?.closest(INTERACTIVE_SELECTOR)) return false;
	return document.querySelector(ACTIVE_OVERLAY_SELECTOR) === null;
}

/**
 * Escape closes an open selection before anything else it could mean (leaving
 * RSVP), even with a toolbar button focused. Typing in a field or an open
 * overlay keeps its own Escape.
 */
export function shouldDismissSelectionOnKey(input: {
	key: string;
	hasSelection: boolean;
	target: Element | null;
	hasOverlay: boolean;
}): boolean {
	return (
		input.key === "Escape" &&
		input.hasSelection &&
		!input.hasOverlay &&
		!input.target?.closest(TEXT_FIELD_SELECTOR)
	);
}

type VolumeKeyAction = "next" | "prev" | "faster" | "slower";

/** Swapping only flips page direction; in RSVP volume up always means faster. */
export function volumeKeyAction(input: {
	key: VolumeKey;
	readerMode: "standard" | "rsvp";
	paginationStyle: PaginationStyle;
	invert: boolean;
}): VolumeKeyAction | null {
	if (input.readerMode === "rsvp") return input.key === "up" ? "faster" : "slower";
	if (input.paginationStyle !== "page") return null;
	const forward = input.key === "down" ? !input.invert : input.invert;
	return forward ? "next" : "prev";
}

type Options = {
	readerMode: "standard" | "rsvp";
	paginationStyle: PaginationStyle;
	currentWpm: number;
	isBlocked: boolean;
	scrollViewRef: React.RefObject<ReaderViewHandle | null>;
	rsvpViewRef: React.RefObject<RsvpViewHandle | null>;
	handleRsvpToggle: () => void;
	/** Exits at the word RSVP is showing. */
	exitRsvpToStandard: () => void;
	hasSelection: boolean;
	cancelSelection: () => void;
	volumeKeys: VolumeKeys;
	isReadingAloud: boolean;
};

export function useKeyboardShortcuts({
	readerMode,
	paginationStyle,
	currentWpm,
	isBlocked,
	scrollViewRef,
	rsvpViewRef,
	handleRsvpToggle,
	exitRsvpToStandard,
	hasSelection,
	cancelSelection,
	volumeKeys,
	isReadingAloud,
}: Options) {
	const handlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
	const volumeHandlerRef = useRef<(key: VolumeKey) => void>(() => {});

	const stepWpm = (delta: number) => rsvpViewRef.current?.changeWpm(clampWpm(currentWpm + delta));

	handlerRef.current = (e: KeyboardEvent) => {
		if (e.defaultPrevented) return;
		const target = e.target instanceof Element ? e.target : null;
		const hasOverlay = document.querySelector(ACTIVE_OVERLAY_SELECTOR) !== null;
		if (shouldDismissSelectionOnKey({ key: e.key, hasSelection, target, hasOverlay })) {
			e.preventDefault();
			cancelSelection();
			return;
		}
		if (target?.closest(INTERACTIVE_SELECTOR)) return;
		if (hasOverlay) return;

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
					stepWpm(WPM_STEP);
					break;
				case "ArrowDown":
					e.preventDefault();
					stepWpm(-WPM_STEP);
					break;
				case "Escape":
					e.preventDefault();
					exitRsvpToStandard();
					break;
			}
		} else if (paginationStyle === "page") {
			switch (e.key) {
				case "ArrowRight":
				case " ":
				case "PageDown":
					e.preventDefault();
					scrollViewRef.current?.goNext?.();
					break;
				case "ArrowLeft":
				case "PageUp":
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

	// Sheets that block reading hand the keys back, so volume works in them;
	// read-aloud needs them to set the speech volume.
	const shouldInterceptVolume =
		volumeKeys.enabled &&
		!isBlocked &&
		!isReadingAloud &&
		(readerMode === "rsvp" || paginationStyle === "page");

	volumeHandlerRef.current = (key: VolumeKey) => {
		// Native disables asynchronously, so a press can still land after a sheet opens.
		if (!shouldInterceptVolume || document.querySelector(ACTIVE_OVERLAY_SELECTOR)) return;
		switch (volumeKeyAction({ key, readerMode, paginationStyle, invert: volumeKeys.invert })) {
			case "next":
				scrollViewRef.current?.goNext?.();
				break;
			case "prev":
				scrollViewRef.current?.goPrev?.();
				break;
			case "faster":
				stepWpm(WPM_STEP);
				break;
			case "slower":
				stepWpm(-WPM_STEP);
				break;
		}
	};

	useEffect(() => {
		if (!shouldInterceptVolume) return;
		setVolumeKeysEnabled(true);
		return () => setVolumeKeysEnabled(false);
	}, [shouldInterceptVolume]);

	useEffect(() => {
		const subscription = subscribeVolumeKeys((key) => volumeHandlerRef.current(key));
		return () => {
			void subscription?.then((h) => h?.remove());
		};
	}, []);
}
