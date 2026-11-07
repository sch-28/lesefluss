const TYPING_SELECTOR = "input, textarea, select, [contenteditable=true], [contenteditable='']";

/** Focused widgets that handle their own keys: a reader key would take theirs. */
const CONTROL_SELECTOR = [
	"a",
	"button",
	"[role=button]",
	"[role=slider]",
	"[role=switch]",
	"[role=checkbox]",
	"[role=radio]",
	"[role=tab]",
	"[role=menuitem]",
	"[role=option]",
	"[role=combobox]",
	"[role=spinbutton]",
].join(",");

/**
 * radix dialogs, popovers and menus, vaul drawers (radix dialogs too), and an
 * inline editor that is not a text field, such as the library table's star row.
 */
const OPEN_OVERLAY_SELECTOR = [
	"[role=dialog][data-state=open]",
	"[role=alertdialog][data-state=open]",
	"[role=menu][data-state=open]",
	"[data-vaul-drawer][data-state=open]",
	"[data-inline-editor]",
].join(",");

function targetOf(e: Event): Element | null {
	return e.target instanceof Element ? e.target : null;
}

export function hasOpenOverlay(): boolean {
	return document.querySelector(OPEN_OVERLAY_SELECTOR) !== null;
}

export function isTypingTarget(target: Element | null): boolean {
	return target?.closest(TYPING_SELECTOR) != null;
}

export function isControlTarget(target: Element | null): boolean {
	return target?.closest(CONTROL_SELECTOR) != null;
}

/**
 * Whether a shortcut may run for this key press: never while typing or over an
 * open overlay, and with a control focused only when the command allows it.
 */
export function isShortcutAllowed(e: KeyboardEvent, { inControls = false } = {}): boolean {
	const target = targetOf(e);
	if (isTypingTarget(target) || hasOpenOverlay()) return false;
	return inControls || !isControlTarget(target);
}
