import { useEffect } from "react";
import { isShortcutAllowed } from "./guard";
import { matchesKey } from "./keys";
import { allCommands, type Command } from "./registry";

/** Runs the first active command bound to this key press; at most one per press. */
export function dispatchCommandKey(
	e: KeyboardEvent,
	commands: readonly Command[] = allCommands(),
): boolean {
	if (e.defaultPrevented || e.isComposing) return false;
	for (const command of commands) {
		if (!command.keys?.some((key) => matchesKey(e, key))) continue;
		if (command.when && !command.when()) continue;
		if (!isShortcutAllowed(e, { inControls: command.inControls })) {
			if (command.claimsKeys) e.preventDefault();
			continue;
		}
		e.preventDefault();
		command.run();
		return true;
	}
	return false;
}

/**
 * Mounted once, at the app root: the app's only keydown listeners for shortcuts.
 * Commands that claim their keys run in capture, before the browser's own
 * Ctrl+K or Ctrl+O; the rest run after the page's handlers, so a widget that
 * handles a key itself (and prevents its default) keeps it.
 */
export function useCommandDispatcher(): void {
	useEffect(() => {
		const onCapture = (e: KeyboardEvent) => {
			dispatchCommandKey(
				e,
				allCommands().filter((c) => c.claimsKeys),
			);
		};
		const onBubble = (e: KeyboardEvent) => {
			dispatchCommandKey(
				e,
				allCommands().filter((c) => !c.claimsKeys),
			);
		};
		window.addEventListener("keydown", onCapture, { capture: true });
		window.addEventListener("keydown", onBubble);
		return () => {
			window.removeEventListener("keydown", onCapture, { capture: true });
			window.removeEventListener("keydown", onBubble);
		};
	}, []);
}
