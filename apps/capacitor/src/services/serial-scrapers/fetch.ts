import { Capacitor } from "@capacitor/core";
import { CATALOG_URL } from "../catalog/client";
import { NativeHttp } from "./native-http";

declare global {
	interface Navigator {
		userAgentData?: { brands?: Array<{ brand: string; version: string }> };
	}
}

// Mirror the fetch-metadata headers Chrome sends for top-level navigations.
// CF Bot Fight Mode uses Sec-Fetch-* and sec-ch-ua to distinguish real browsers from bots.
function getBrowserHeaders(): Record<string, string> {
	const headers: Record<string, string> = {
		"User-Agent": navigator.userAgent,
		Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
		"Accept-Language": "en-US,en;q=0.5",
		"Upgrade-Insecure-Requests": "1",
		"Sec-Fetch-Dest": "document",
		"Sec-Fetch-Mode": "navigate",
		"Sec-Fetch-Site": "none",
		"Sec-Fetch-User": "?1",
	};
	const brands = navigator.userAgentData?.brands;
	if (brands) {
		headers["sec-ch-ua"] = brands.map((b) => `"${b.brand}";v="${b.version}"`).join(", ");
		headers["sec-ch-ua-mobile"] = "?1";
		headers["sec-ch-ua-platform"] = Capacitor.getPlatform() === "ios" ? '"iOS"' : '"Android"';
	}
	return headers;
}

function isCfChallengePage(html: string): boolean {
	return (
		html.includes("cf-turnstile") ||
		html.includes('id="challenge-form"') ||
		/<title[^>]*>Just a moment/i.test(html)
	);
}

export type FetchOpts = {
	method?: "GET" | "POST";
	body?: string;
	/** Content-Type for the request body. Required when `body` is set; defaults to form-encoded. */
	contentType?: string;
};

/** Native: OkHttp+Conscrypt (Chrome JA3, CORS-bypassed). Web: catalog /proxy/article endpoint. */
export async function fetchHtml(url: string, opts: FetchOpts = {}): Promise<string> {
	const method = opts.method ?? "GET";

	if (Capacitor.isNativePlatform()) {
		const headers = getBrowserHeaders();
		// `Sec-Fetch-Mode: navigate` is wrong for sub-resource fetches like XHR/AJAX,
		// so flip it so admin-ajax POSTs aren't flagged as a top-level navigation.
		if (method === "POST") {
			headers["Sec-Fetch-Mode"] = "cors";
			headers["Sec-Fetch-Dest"] = "empty";
			headers.Accept = "*/*";
		}
		const res = await NativeHttp.request({
			url,
			method,
			body: opts.body,
			contentType: opts.contentType,
			headers,
		});
		if (res.status === 403 || isCfChallengePage(res.data)) {
			// WebView fallback only handles GET, so POST through admin-ajax can't
			// replay here. Surface the CF block so the caller can recover (or fail loudly).
			if (method !== "GET") throw new Error("CLOUDFLARE_CHALLENGE");
			// OkHttp fingerprint blocked by CF. Fall back to WebView which carries Chrome's
			// exact TLS stack and is trusted by CF without a challenge.
			let webRes: { status: number; data: string };
			try {
				webRes = await NativeHttp.fetchViaWebView({ url, userAgent: navigator.userAgent });
			} catch (err) {
				// 403/503 from the WebView fallback means CF blocked us a second time. Surface
				// as CLOUDFLARE_CHALLENGE so the Verify banner can route the user to the
				// challenge page. Other rejections (timeouts, parse errors) propagate as-is.
				const msg = err instanceof Error ? err.message : String(err);
				if (/^FETCH_FAILED:(403|503)$/.test(msg)) throw new Error("CLOUDFLARE_CHALLENGE");
				throw err;
			}
			if (isCfChallengePage(webRes.data)) throw new Error("CLOUDFLARE_CHALLENGE");
			if (webRes.status === 403 || webRes.status === 503) {
				throw new Error("CLOUDFLARE_CHALLENGE");
			}
			if (webRes.status >= 400) throw new Error(`FETCH_FAILED:${webRes.status}`);
			return webRes.data;
		}
		if (res.status >= 400) throw new Error(`FETCH_FAILED:${res.status}`);
		return res.data;
	}

	let res: Response;
	try {
		res = await fetch(`${CATALOG_URL}/proxy/article`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				url,
				method,
				body: opts.body,
				contentType: opts.contentType,
			}),
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
