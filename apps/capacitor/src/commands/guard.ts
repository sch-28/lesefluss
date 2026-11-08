const TYPING_SELECTOR = "input, textarea, select, [contenteditable=true], [contenteditable='']";

/** Focused controls whose only keys are Enter and Space. */
const BUTTON_SELECTOR = ["a", "button", "[role=button]", "[role=switch]", "[role=checkbox]"].join(
	",",
);

/** Focused widgets that handle their own keys: a reader key would take theirs. */
const WIDGET_SELECTOR = [
	"[role=slider]",
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

/**
 * A button the mouse just clicked keeps focus without a focus ring; the user is
 * not driving it from the keyboard, so it must not swallow the page's keys
 * (LESE-185.22). Chromium turns `:focus-visible` on with the first key press,
 * before any keydown listener runs, so the origin is recorded at focus time:
 * a press marks an element, Tab clears it, and any other focus (a menu handing
 * focus back, the window coming back) keeps what it was.
 */
const pointerFocused = new WeakSet<Element>();
let lastTabAt = Number.NEGATIVE_INFINITY;
let lastPointerDownAt = Number.NEGATIVE_INFINITY;
const FOCUS_CAUSE_WINDOW_MS = 1000;

if (typeof window !== "undefined") {
	window.addEventListener("pointerdown", () => (lastPointerDownAt = performance.now()), true);
	window.addEventListener(
		"keydown",
		(e) => {
			if (e.key === "Tab") lastTabAt = performance.now();
		},
		true,
	);
	window.addEventListener(
		"focusin",
		(e) => {
			const target = targetOf(e);
			const now = performance.now();
			const isFromTab = now - lastTabAt < FOCUS_CAUSE_WINDOW_MS && lastTabAt > lastPointerDownAt;
			const isFromPointer = !isFromTab && now - lastPointerDownAt < FOCUS_CAUSE_WINDOW_MS;
			lastTabAt = lastPointerDownAt = Number.NEGATIVE_INFINITY;
			if (!target) return;
			if (isFromTab) pointerFocused.delete(target);
			else if (isFromPointer) pointerFocused.add(target);
		},
		true,
	);
}

function isPointerFocused(el: Element): boolean {
	return el === document.activeElement && pointerFocused.has(el);
}

export function isControlTarget(target: Element | null): boolean {
	if (!target) return false;
	if (target.closest(WIDGET_SELECTOR)) return true;
	const button = target.closest(BUTTON_SELECTOR);
	return button != null && !isPointerFocused(button);
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
