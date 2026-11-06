import type { PaginationStyle } from "@lesefluss/core";
import { useEffect, useRef } from "react";
import { hasOpenOverlay } from "../../commands/guard";
import { useRegisterCommands } from "../../commands/registry";
import type { VolumeKeys } from "../../hooks/use-appearance-settings";
import {
	setVolumeKeysEnabled,
	subscribeVolumeKeys,
	type VolumeKey,
} from "../../services/volume-keys";
import { type ReaderKeyInput, readerKeyCommands } from "./commands";

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

type Options = ReaderKeyInput & {
	volumeKeys: VolumeKeys;
	isReadingAloud: boolean;
};

/** Registers the reader's keys with the app's dispatcher and handles the volume keys. */
export function useKeyboardShortcuts({
	readerMode,
	paginationStyle,
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
	useRegisterCommands(
		readerKeyCommands({
			readerMode,
			paginationStyle,
			isBlocked,
			scrollViewRef,
			rsvpViewRef,
			handleRsvpToggle,
			exitRsvpToStandard,
			hasSelection,
			cancelSelection,
		}),
	);

	const volumeHandlerRef = useRef<(key: VolumeKey) => void>(() => {});
	const stepWpm = (direction: 1 | -1) => rsvpViewRef.current?.stepWpm(direction);

	// Sheets that block reading hand the keys back, so volume works in them;
	// read-aloud needs them to set the speech volume.
	const shouldInterceptVolume =
		volumeKeys.enabled &&
		!isBlocked &&
		!isReadingAloud &&
		(readerMode === "rsvp" || paginationStyle === "page");

	volumeHandlerRef.current = (key: VolumeKey) => {
		// Native disables asynchronously, so a press can still land after a sheet opens.
		if (!shouldInterceptVolume || hasOpenOverlay()) return;
		switch (volumeKeyAction({ key, readerMode, paginationStyle, invert: volumeKeys.invert })) {
			case "next":
				scrollViewRef.current?.goNext?.();
				break;
			case "prev":
				scrollViewRef.current?.goPrev?.();
				break;
			case "faster":
				stepWpm(1);
				break;
			case "slower":
				stepWpm(-1);
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
