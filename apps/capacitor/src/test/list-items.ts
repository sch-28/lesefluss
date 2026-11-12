import { expect } from "vitest";

/** Every list under `container` holds only `<li>`s, so screen readers count its items. */
export function expectListsHoldOnlyItems(container: HTMLElement, atLeast = 1) {
	const lists = [...container.querySelectorAll("ul, ol")];
	expect(lists.length).toBeGreaterThanOrEqual(atLeast);
	for (const list of lists) {
		const name = list.getAttribute("aria-labelledby") ?? list.className;
		for (const child of list.children) expect(child.tagName, name).toBe("LI");
	}
}
