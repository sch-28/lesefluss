/**
 * A key is `[Mod+][Alt+][Shift+]<key>`: Mod is Ctrl, or Cmd on macOS. `<key>` is
 * a KeyboardEvent.key value, a letter, or `Space`. Modifiers must match exactly,
 * except Shift on a non-letter: `?` already needs Shift on most layouts.
 */
type Chord = { mod: boolean; alt: boolean; shift: boolean; key: string; isLetter: boolean };

function parseKey(spec: string): Chord {
	const parts = spec.split("+");
	const last = parts.pop() ?? "";
	const mods = new Set(parts);
	const key = last === "Space" ? " " : last;
	const isLetter = /^[a-z]$/i.test(key);
	return {
		mod: mods.has("Mod"),
		alt: mods.has("Alt"),
		shift: mods.has("Shift"),
		key: isLetter ? key.toLowerCase() : key,
		isLetter,
	};
}

export function matchesKey(e: KeyboardEvent, spec: string, isMac = isMacPlatform()): boolean {
	const chord = parseKey(spec);
	if (chord.mod) {
		// Ctrl on macOS stays the system's text-editing key (Ctrl+K kills a line).
		if (!(isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey)) return false;
	} else if (e.ctrlKey || e.metaKey) return false;
	if (e.altKey !== chord.alt) return false;
	if (chord.isLetter) {
		// On Shift, not the letter's case: CapsLock alone is not Shift+B.
		return e.shiftKey === chord.shift && e.key.toLowerCase() === chord.key;
	}
	if (chord.shift && !e.shiftKey) return false;
	return e.key === chord.key;
}

export function isMacPlatform(): boolean {
	return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
}

const KEY_LABELS: Record<string, string> = {
	" ": "Space",
	ArrowRight: "→",
	ArrowLeft: "←",
	ArrowUp: "↑",
	ArrowDown: "↓",
	Escape: "Esc",
	PageDown: "PgDn",
	PageUp: "PgUp",
	Enter: "Enter",
};

/** The chips of one key, e.g. `["Ctrl", "K"]` or `["⌘", "K"]`. */
export function formatKey(spec: string, isMac = isMacPlatform()): string[] {
	const chord = parseKey(spec);
	const chips: string[] = [];
	if (chord.mod) chips.push(isMac ? "⌘" : "Ctrl");
	if (chord.alt) chips.push(isMac ? "⌥" : "Alt");
	if (chord.shift) chips.push(isMac ? "⇧" : "Shift");
	chips.push(KEY_LABELS[chord.key] ?? (chord.isLetter ? chord.key.toUpperCase() : chord.key));
	return chips;
}
