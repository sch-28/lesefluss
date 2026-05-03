/**
 * Primary-side dual-screen bridge.
 *
 * Subscribes to readerBus, forwards full snapshots to the secondary WebView
 * via DualScreen.pushState, and listens for commands coming back from the
 * secondary, dispatching them into readerBus.
 *
 * Lives in its own folder so it (plus the secondary tree) is isolated to a
 * lazy-loaded chunk; nothing here is statically imported by the rest of the app.
 */

import type { PluginListenerHandle } from "@capacitor/core";
import { DualScreen, type DualScreenCommand } from "../services/dual-screen";
import { readerBus, type ReaderSnapshot } from "../services/reader-bus";

let lastSent = "";

function payload(snap: ReaderSnapshot): ReaderSnapshot {
	return snap;
}

function dispatch(cmd: DualScreenCommand) {
	switch (cmd.kind) {
		case "togglePlayPause":
			readerBus.togglePlayPause();
			return;
		case "pause":
			readerBus.pause();
			return;
		case "backWord":
			readerBus.backWord();
			return;
		case "forwardWord":
			readerBus.forwardWord();
			return;
		case "backSentence":
			readerBus.backSentence();
			return;
		case "forwardSentence":
			readerBus.forwardSentence();
			return;
		case "changeWpm":
			readerBus.changeWpm(cmd.wpm);
			return;
		case "openBook":
			readerBus.openBook(cmd.bookId);
			return;
		case "updateSetting":
			readerBus.updateSetting(cmd.key, cmd.value);
			return;
	}
}

export function startBridge(): () => void {
	const unsubscribeBus = readerBus.subscribe((snap) => {
		const next = payload(snap);
		const key = JSON.stringify(next);
		if (key === lastSent) return;
		lastSent = key;
		DualScreen.pushState(next).catch(() => {
			// Plugin may be torn down (background/exit); swallow.
		});
	});

	let cmdHandle: PluginListenerHandle | null = null;
	DualScreen.addListener("command", dispatch).then((h) => {
		cmdHandle = h;
	});

	return () => {
		unsubscribeBus();
		cmdHandle?.remove();
	};
}
