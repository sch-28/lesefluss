import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { importArticle, lookupArticleByUrl } from "../src/lib/article";
import { clearAuthSession, getAuthSession, signIn, signOut } from "../src/lib/auth";
import {
	type ArticleLookupResponse,
	type BackgroundRequest,
	type BackgroundResponse,
	type ContentScriptRequest,
	type ContentScriptResponse,
	type PageCapturePayload,
	type SaveArticleResponse,
	UnauthorizedError,
} from "../src/lib/messages";

const SAVE_SELECTION_MENU_ID = "save-selection-to-lesefluss";

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "Something went wrong.";
}

async function activeTabId(): Promise<number> {
	const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
	if (!tab?.id) throw new Error("No active tab found.");
	return tab.id;
}

function isPageCapturePayload(value: unknown): value is PageCapturePayload {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as PageCapturePayload).html === "string" &&
		typeof (value as PageCapturePayload).url === "string" &&
		typeof (value as PageCapturePayload).title === "string"
	);
}

function isPageCaptureReady(value: unknown): value is { type: "lesefluss:page-capture-ready" } {
	return (
		typeof value === "object" &&
		value !== null &&
		(value as { type?: unknown }).type === "lesefluss:page-capture-ready"
	);
}

async function isPageCaptureInjected(tabId: number): Promise<boolean> {
	try {
		const response: unknown = await browser.tabs.sendMessage(tabId, "lesefluss:page-capture-ping");
		return isPageCaptureReady(response);
	} catch {
		return false;
	}
}

async function injectPageCapture(tabId: number): Promise<void> {
	if (await isPageCaptureInjected(tabId)) return;
	await browser.scripting.executeScript({
		target: { tabId },
		files: ["/content-scripts/page-capture.js"],
	});
}

async function capture(tabId: number, mode: "page" | "selection"): Promise<PageCapturePayload> {
	const request: ContentScriptRequest =
		mode === "page" ? { type: "extract:page" } : { type: "extract:selection" };

	try {
		await injectPageCapture(tabId);
	} catch {
		// Injection refused on chrome://, about:, the web store, PDF viewers,
		// or file:// without explicit permission.
		throw new Error("Lesefluss can't capture this page (it may be a browser-internal page).");
	}

	let result: ContentScriptResponse | unknown;
	try {
		result = await browser.tabs.sendMessage(tabId, request);
	} catch {
		throw new Error("Lesefluss can't capture this page (it may be a browser-internal page).");
	}

	if (result && typeof result === "object" && "error" in result) {
		throw new Error(String((result as { error: unknown }).error));
	}
	if (!isPageCapturePayload(result)) {
		throw new Error("Could not capture content from this page.");
	}
	return result;
}

async function savePayload(payload: PageCapturePayload): Promise<SaveArticleResponse> {
	const session = await getAuthSession();
	if (!session) throw new Error("Please sign in to Lesefluss first.");
	try {
		return await importArticle(session.token, payload);
	} catch (error) {
		if (error instanceof UnauthorizedError) {
			await clearAuthSession();
		}
		throw error;
	}
}

async function saveActivePage(): Promise<SaveArticleResponse> {
	const tabId = await activeTabId();
	return savePayload(await capture(tabId, "page"));
}

async function currentPageUrl(): Promise<string> {
	const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
	if (!tab?.url) throw new Error("No active tab URL found.");
	return tab.url;
}

async function lookupCurrentPage(): Promise<ArticleLookupResponse> {
	const session = await getAuthSession();
	if (!session) return null;
	try {
		return await lookupArticleByUrl(session.token, await currentPageUrl());
	} catch (error) {
		if (error instanceof UnauthorizedError) await clearAuthSession();
		throw error;
	}
}

async function notify(title: string, message: string): Promise<void> {
	await browser.notifications.create({
		type: "basic",
		iconUrl: browser.runtime.getURL("/icon-128.png"),
		title,
		message,
	});
}

async function handleRequest(message: BackgroundRequest): Promise<BackgroundResponse> {
	try {
		if (message.type === "auth:get-session") return { ok: true, data: await getAuthSession() };
		if (message.type === "auth:sign-in") return { ok: true, data: await signIn() };
		if (message.type === "auth:sign-out") {
			await signOut();
			return { ok: true, data: null };
		}
		if (message.type === "article:lookup-current-page") {
			return { ok: true, data: await lookupCurrentPage() };
		}
		if (message.type === "article:save-page") return { ok: true, data: await saveActivePage() };

		return { ok: false, error: "Unsupported extension message." };
	} catch (error) {
		return { ok: false, error: errorMessage(error) };
	}
}

export default defineBackground(() => {
	browser.runtime.onInstalled.addListener(() => {
		browser.contextMenus.create({
			id: SAVE_SELECTION_MENU_ID,
			title: "Save selection to Lesefluss",
			contexts: ["selection"],
		});
	});

	browser.contextMenus.onClicked.addListener(async (info, tab) => {
		if (info.menuItemId !== SAVE_SELECTION_MENU_ID || !tab?.id) return;
		try {
			const payload = await capture(tab.id, "selection");
			await savePayload(payload);
			await notify("Saved to Lesefluss", "The selected text was added to your library.");
		} catch (error) {
			await notify("Lesefluss import failed", errorMessage(error));
		}
	});

	browser.runtime.onMessage.addListener((message: BackgroundRequest, _sender, sendResponse) => {
		handleRequest(message).then(sendResponse);
		// Tell Chrome's native runtime that sendResponse will be called async.
		// WXT's `browser` aliases globalThis.chrome on Chromium, where returning
		// a Promise from the listener is not supported.
		return true;
	});
});
