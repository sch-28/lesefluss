import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { CATALOG_URL } from "../catalog/client";

/**
 * Single shared HTTP utility. Adapters never call `fetch` directly.
 *
 *   - Native (Capacitor) — `CapacitorHttp.request`. Bypasses CORS and presents
 *     a real User-Agent so Cloudflare-protected SSR pages serve normally.
 *   - Web/dev — falls back to the existing catalog `/proxy/article` endpoint
 *     (CORS + SSRF guards live there).
 */
export async function fetchHtml(url: string): Promise<string> {
	if (Capacitor.isNativePlatform()) {
		const res = await CapacitorHttp.request({
			method: "GET",
			url,
			responseType: "text",
		});
		if (res.status >= 400) throw new Error(`FETCH_FAILED:${res.status}`);
		// CapacitorHttp auto-parses JSON responses based on Content-Type and
		// ignores `responseType: "text"`. When the upstream returns JSON (e.g.
		// Wuxiaworld's /api/novels/search), `res.data` is already a parsed
		// object — `String(obj)` would yield "[object Object]" and break any
		// adapter that JSON.parse's the result. Stringify so the round-trip
		// is lossless. An empty / null body is treated as a fetch failure to
		// avoid leaking `undefined` (or the literal string "undefined") into
		// adapters that expect HTML or JSON to parse.
		if (typeof res.data === "string") return res.data;
		if (res.data == null) throw new Error("FETCH_FAILED:EMPTY_BODY");
		return JSON.stringify(res.data);
	}

	let res: Response;
	try {
		res = await fetch(`${CATALOG_URL}/proxy/article`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ url }),
		});
	} catch {
		throw new Error("FETCH_FAILED");
	}
	if (res.status === 413) throw new Error("TOO_LARGE");
	if (!res.ok) throw new Error("Chapter not available in the web app — open it in the mobile app.");
	const data = (await res.json()) as { html?: string };
	if (!data.html) throw new Error("FETCH_FAILED");
	return data.html;
}
