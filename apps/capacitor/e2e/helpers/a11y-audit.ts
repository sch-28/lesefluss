import type { CDPSession, Page } from "@playwright/test";

/** Roles a screen reader announces by name: with no name, the user hears only "button". */
const NAMED_ROLES = new Set([
	"button",
	"link",
	"slider",
	"checkbox",
	"switch",
	"radio",
	"tab",
	"tabpanel",
	"combobox",
	"textbox",
	"searchbox",
	"spinbutton",
	"menuitem",
	"menuitemcheckbox",
	"menuitemradio",
	"option",
	"listbox",
	"treeitem",
	"dialog",
	"alertdialog",
	"image",
	"progressbar",
	"meter",
]);

/** Roles that tell a screen reader nothing about what a click does. */
const GENERIC_ROLES = new Set(["generic", "none", "presentation", "paragraph", "StaticText", ""]);

async function withCdp<T>(page: Page, fn: (cdp: CDPSession) => Promise<T>): Promise<T> {
	const cdp = await page.context().newCDPSession(page);
	try {
		return await fn(cdp);
	} finally {
		await cdp.detach();
	}
}

async function describe(cdp: CDPSession, backendNodeId: number): Promise<string> {
	const { node } = await cdp.send("DOM.describeNode", { backendNodeId });
	const attrs = node.attributes ?? [];
	const cls = attrs.includes("class")
		? ` class="${attrs[attrs.indexOf("class") + 1]?.slice(0, 60)}"`
		: "";
	return `<${node.localName}${cls}>`;
}

/**
 * Problems a screen-reader user meets on screen, read from Chromium's own
 * accessibility tree (the one TalkBack sees through the WebView):
 * - a node in a named role (button, link, slider, dialog, image, progressbar…)
 *   with an empty name;
 * - an element with a click listener that the tree exposes as generic or not
 *   at all: TalkBack offers "double-tap to activate" on it, or treats the
 *   text under it as one node, with nothing saying what it does.
 * - a menu button (aria-haspopup menu or true) with no text of its own: on
 *   Android, Chromium exposes such a popup button by its text and drops its
 *   aria-label, so TalkBack finds it unnamed though desktop Chrome names it
 *   (seen on a Pixel, TASK-205.13; a visually hidden span fixes it).
 * `allowClickable` lists selectors of known generic clickables (with a task to fix them).
 * Not counted: React's root container (it holds React's own delegated
 * listeners), <body> (Chromium reports it click-responsive whenever the
 * document has click listeners, such as the reader's word gestures; Android's
 * clickable flag does not reach a node from document-level listeners), and
 * anything aria-hidden (out of the tree on purpose).
 */
export async function a11yProblems(page: Page, allowClickable: string[] = []): Promise<string[]> {
	return withCdp(page, async (cdp) => {
		const problems: string[] = [];
		const textlessMenuButtons = await page.evaluate(() =>
			[...document.querySelectorAll('[aria-haspopup="menu"], [aria-haspopup="true"]')]
				.filter((el) => el.getClientRects().length > 0 && !el.textContent?.trim())
				.map((el) => el.getAttribute("aria-label") ?? el.outerHTML.slice(0, 60)),
		);
		for (const label of textlessMenuButtons) {
			problems.push(`menu button with no text, unnamed on Android: ${label}`);
		}
		const { nodes } = await cdp.send("Accessibility.getFullAXTree");
		const byBackend = new Map(nodes.map((n) => [n.backendDOMNodeId, n]));

		for (const n of nodes) {
			const role = String(n.role?.value ?? "");
			if (n.ignored || !NAMED_ROLES.has(role) || String(n.name?.value ?? "").trim()) continue;
			const where = n.backendDOMNodeId !== undefined ? await describe(cdp, n.backendDOMNodeId) : "";
			problems.push(`unnamed ${role} ${where}`);
		}

		const { documents, strings } = await cdp.send("DOMSnapshot.captureSnapshot", {
			computedStyles: [],
		});
		const doc = documents[0];
		const laidOut = new Set(doc.layout.nodeIndex);
		for (const index of doc.nodes.isClickable?.index ?? []) {
			if (!laidOut.has(index)) continue;
			const backendNodeId = doc.nodes.backendNodeId?.[index];
			const nameIndex = doc.nodes.nodeName?.[index];
			if (backendNodeId === undefined || nameIndex === undefined) continue;
			if (!/^[A-Z]/.test(strings[nameIndex] ?? "")) continue; // elements only
			const ax = byBackend.get(backendNodeId);
			const role = ax && !ax.ignored ? String(ax.role?.value ?? "") : "";
			if (!GENERIC_ROLES.has(role)) continue;
			const { object } = await cdp.send("DOM.resolveNode", { backendNodeId });
			const { result } = await cdp.send("Runtime.callFunctionOn", {
				objectId: object.objectId,
				functionDeclaration:
					"function (sels) { return this.id === 'root' || this === document.body || sels.slice(1).some((s) => this.closest(s)); }",
				arguments: [{ value: ["#root", '[aria-hidden="true"]', ...allowClickable] }],
				returnByValue: true,
			});
			if (result.value === true) continue;
			problems.push(
				`clickable but ${role || "not in the tree"}: ${await describe(cdp, backendNodeId)}`,
			);
		}
		return problems;
	});
}

/** Whether the accessibility tree has a node of its own for the element, or folds it into its parent's text. */
export async function isOwnA11yNode(page: Page, selector: string): Promise<boolean> {
	return withCdp(page, async (cdp) => {
		const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
		const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector });
		const { node } = await cdp.send("DOM.describeNode", { nodeId });
		const { nodes } = await cdp.send("Accessibility.getPartialAXTree", {
			backendNodeId: node.backendNodeId,
			fetchRelatives: false,
		});
		return nodes.some((n) => !n.ignored);
	});
}
