import { type BrowserContext, test as base, chromium, type Page } from "@playwright/test";

export type FramedPage = {
	page: Page;
	context: BrowserContext;
	/** Issue a frame every `ms` from now on; 16 is about 60 fps. */
	setFrameMs: (ms: number) => void;
};

type Options = {
	viewport?: { width: number; height: number };
	hasTouch?: boolean;
};

/**
 * `framedPage(options)` opens a page whose frames the test issues through CDP
 * BeginFrameControl, so a slow device's frame rate runs headless: scroll
 * events, ResizeObserver callbacks and rAF wait for the next issued frame while
 * the page's timers keep real time. It starts at about 60 fps with the project's
 * `use` settings (Playwright traces it like any context), and is closed after the test.
 */
export const test = base.extend<{ framedPage: (options?: Options) => Promise<FramedPage> }>({
	framedPage: async ({ baseURL, viewport, hasTouch }, use) => {
		const contexts: BrowserContext[] = [];
		await use(async (options = {}) => {
			const context = await chromium.launchPersistentContext("", {
				baseURL,
				viewport: options.viewport ?? viewport,
				hasTouch: options.hasTouch ?? hasTouch,
				args: ["--enable-begin-frame-control", "--run-all-compositor-stages-before-draw"],
			});
			contexts.push(context);
			const opener = context.pages()[0] ?? (await context.newPage());
			const created = context.waitForEvent("page");
			const cdp = await context.newCDPSession(opener);
			await cdp.send("Target.createTarget", { url: "about:blank", enableBeginFrameControl: true });
			const page = await created;
			await opener.close();
			const frames = await context.newCDPSession(page);
			let frameMs = 16;
			let open = true;
			context.on("close", () => {
				open = false;
			});
			void (async () => {
				while (open) {
					await frames
						.send("HeadlessExperimental.beginFrame", { interval: frameMs })
						.catch(() => {});
					await new Promise((r) => setTimeout(r, frameMs));
				}
			})();
			return {
				page,
				context,
				setFrameMs: (ms) => {
					frameMs = ms;
				},
			};
		});
		for (const context of contexts) await context.close();
	},
});
