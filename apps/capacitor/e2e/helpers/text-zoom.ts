import type { Page } from "@playwright/test";

/**
 * Emulates Android WebView textZoom (which follows the system font scale; 200 %
 * at Android's largest setting). textZoom multiplies every computed font size,
 * and rem lengths follow the root's, while px lengths stay put. Chrome has no
 * text-only zoom, and CSS `zoom` would scale px lengths too and throw off
 * floating-ui's popover placement. So this scales font sizes where the app
 * sets them:
 * - inline px font sizes (the root size theme-context sets, the reading text),
 *   through a proxy on each element's `style`: React writes `style.fontSize`,
 *   and the write lands scaled before the first layout. Chromium keeps style
 *   properties on each instance, not on CSSStyleDeclaration.prototype, and a
 *   MutationObserver would scale only after the commit, when page mode has
 *   already measured its columns;
 * - `text-[Npx]` utilities, by a rule per class as elements carrying one appear;
 * - the root before theme-context sets it.
 * A few px font sizes in stylesheets stay unscaled. Specs assert the doubled
 * root and reading-text sizes, so a silent no-op fails.
 */
export async function emulateTextZoom(page: Page, factor: number): Promise<void> {
	await page.addInitScript((factor) => {
		const scalePx = (value: unknown) => {
			const px = /^(\d+(?:\.\d+)?)px$/.exec(String(value).trim())?.[1];
			return px === undefined ? value : `${Number(px) * factor}px`;
		};
		const style = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "style");
		const getStyle = style?.get;
		if (!style || !getStyle) throw new Error("No HTMLElement.prototype.style accessor");
		const proxies = new WeakMap<CSSStyleDeclaration, CSSStyleDeclaration>();
		Object.defineProperty(HTMLElement.prototype, "style", {
			...style,
			get(this: HTMLElement) {
				const real: CSSStyleDeclaration = getStyle.call(this);
				let proxy = proxies.get(real);
				if (!proxy) {
					proxy = new Proxy(real, {
						set(target, prop, value) {
							Reflect.set(target, prop, prop === "fontSize" ? scalePx(value) : value);
							return true;
						},
						get(target, prop) {
							if (prop === "setProperty") {
								return (name: string, value: string | null, priority?: string) =>
									target.setProperty(
										name,
										name === "font-size" && value ? String(scalePx(value)) : value,
										priority,
									);
							}
							const value = Reflect.get(target, prop);
							return typeof value === "function" ? value.bind(target) : value;
						},
					});
					proxies.set(real, proxy);
				}
				return proxy;
			},
		});

		const sheet = new CSSStyleSheet();
		sheet.insertRule(`html:not([style*="font-size"]) { font-size: ${16 * factor}px; }`);
		const scaled = new Set<string>();
		const scaleClasses = (el: Element) => {
			for (const cls of el.classList) {
				const px = /^text-\[(\d+(?:\.\d+)?)px\]$/.exec(cls)?.[1];
				if (!px || scaled.has(cls)) continue;
				scaled.add(cls);
				sheet.insertRule(
					`.${CSS.escape(cls)} { font-size: ${Number(px) * factor}px !important; }`,
					sheet.cssRules.length,
				);
			}
		};
		const scaleTree = (node: Node) => {
			if (!(node instanceof Element)) return;
			scaleClasses(node);
			for (const el of node.querySelectorAll("[class*='text-[']")) scaleClasses(el);
		};
		new MutationObserver((mutations) => {
			for (const m of mutations) {
				if (m.type === "attributes") scaleClasses(m.target as Element);
				else for (const node of m.addedNodes) scaleTree(node);
			}
		}).observe(document, {
			subtree: true,
			childList: true,
			attributes: true,
			attributeFilter: ["class"],
		});
		document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
	}, factor);
}

/** Computed root and reading-text font sizes, for specs to check the zoom took. */
export function zoomedSizes(page: Page): Promise<{ root: string; readingText: string | null }> {
	return page.evaluate(() => {
		const word = document.querySelector("span[data-word]");
		return {
			root: getComputedStyle(document.documentElement).fontSize,
			readingText: word ? getComputedStyle(word).fontSize : null,
		};
	});
}
