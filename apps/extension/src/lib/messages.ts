export interface PageCapturePayload {
	html: string;
	url: string;
	title: string;
}

export type BackgroundRequest =
	| { type: "auth:get-session" }
	| { type: "auth:sign-in" }
	| { type: "auth:sign-out" }
	| { type: "article:lookup-current-page" }
	| { type: "article:save-page" };

export type ContentScriptRequest = { type: "extract:page" } | { type: "extract:selection" };

export type BackgroundResponse<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

export interface SaveArticleResponse {
	id: string;
	title: string;
	url: string;
}

export type ArticleLookupResponse = SaveArticleResponse | null;

export class UnauthorizedError extends Error {
	constructor() {
		super("Your session expired. Please sign in again.");
		this.name = "UnauthorizedError";
	}
}
