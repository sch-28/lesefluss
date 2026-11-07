type DocumentPictureInPicture = {
	requestWindow(options: { width: number; height: number }): Promise<Window>;
	readonly window: Window | null;
};

function pipApi(win: Window): DocumentPictureInPicture | null {
	const api = (win as Window & { documentPictureInPicture?: DocumentPictureInPicture })
		.documentPictureInPicture;
	return api ?? null;
}

/** Document Picture-in-Picture: Chromium only; elsewhere the caller floats its UI in the tab. */
export function isPipSupported(win: Window = window): boolean {
	return pipApi(win) !== null;
}

/**
 * The pop-up gets no stylesheets of its own. Rules are copied as text so the
 * Vite dev server's injected <style> tags come along; a cross-origin sheet
 * whose rules can't be read is linked instead.
 */
function copyStyles(from: Document, to: Document): void {
	for (const sheet of Array.from(from.styleSheets)) {
		try {
			const css = Array.from(sheet.cssRules, (rule) => rule.cssText).join("\n");
			const style = to.createElement("style");
			style.textContent = css;
			to.head.appendChild(style);
		} catch {
			if (!sheet.href) continue;
			const link = to.createElement("link");
			link.rel = "stylesheet";
			link.href = sheet.href;
			to.head.appendChild(link);
		}
	}
	// Theme classes and the app font size live on <html> and <body>.
	to.documentElement.className = from.documentElement.className;
	to.documentElement.setAttribute("style", from.documentElement.getAttribute("style") ?? "");
	to.body.className = from.body.className;
}

export type PipOptions = { width: number; height: number; title: string };

/**
 * Opens a Document Picture-in-Picture window styled like the opener. Must run
 * inside a click or key press in the opener. One pop-up per tab: an open one is
 * closed first, so its own `pagehide` save runs before the new one shows.
 */
export async function openPipWindow(
	{ width, height, title }: PipOptions,
	win: Window = window,
): Promise<Window> {
	const api = pipApi(win);
	if (!api) throw new Error("Document Picture-in-Picture is not supported");
	api.window?.close();
	const pip = await api.requestWindow({ width, height });
	// The title is what a tiling window manager matches its rules on.
	pip.document.title = title;
	copyStyles(win.document, pip.document);
	return pip;
}
