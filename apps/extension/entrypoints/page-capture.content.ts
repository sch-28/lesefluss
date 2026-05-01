import { Readability } from "@mozilla/readability";
import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";
import type {
	ContentScriptRequest,
	ContentScriptResponse,
	PageCapturePayload,
} from "../src/lib/messages";

function isContentScriptRequest(value: unknown): value is ContentScriptRequest {
	if (typeof value !== "object" || value === null) return false;
	const type = (value as { type?: unknown }).type;
	return type === "extract:page" || type === "extract:selection";
}

function serializeNode(node: Node): string {
	return new XMLSerializer().serializeToString(node);
}

function serializeChildren(node: Node): string {
	return Array.from(node.childNodes, serializeNode).join("");
}

function extractPage(): PageCapturePayload {
	// Readability mutates the document it parses; clone first so the live page
	// keeps its DOM.
	const cloned = document.cloneNode(true) as Document;
	const article = new Readability(cloned, { serializer: serializeChildren }).parse();
	if (article?.content) {
		return {
			html: article.content,
			url: location.href,
			title: article.title?.trim() || document.title,
		};
	}
	return {
		html: serializeNode(document.documentElement),
		url: location.href,
		title: document.title,
	};
}

function extractSelection(): PageCapturePayload {
	const selection = window.getSelection();
	if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
		throw new Error("No selected text found on this page.");
	}

	const container = document.createElement("div");
	for (let i = 0; i < selection.rangeCount; i += 1) {
		container.append(selection.getRangeAt(i).cloneContents());
	}

	return {
		html: serializeChildren(container).trim(),
		url: location.href,
		title: document.title,
	};
}

function sendContentResponse(sendResponse: (response: ContentScriptResponse) => void) {
	sendResponse({ type: "lesefluss:page-capture-ready" });
}

export default defineContentScript({
	// Bundled but not auto-registered. The background injects this script via
	// chrome.scripting.executeScript on user gesture (activeTab). Matches is
	// kept narrow so WXT doesn't add <all_urls> to host_permissions.
	registration: "runtime",
	matches: ["https://lesefluss.app/*"],
	runAt: "document_idle",
	main() {
		browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
			if (message === "lesefluss:page-capture-ping") {
				sendContentResponse(sendResponse);
				return false;
			}

			// runtime.onMessage is shared across the whole extension. Returning
			// false here (and not calling sendResponse) leaves messages addressed
			// to the background untouched.
			if (!isContentScriptRequest(message)) return false;
			try {
				sendResponse(message.type === "extract:page" ? extractPage() : extractSelection());
			} catch (error) {
				const detail = error instanceof Error ? error.message : "extract failed";
				sendResponse({ error: detail });
			}
			return false;
		});
	},
});
