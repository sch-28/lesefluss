import { Capacitor } from "@capacitor/core";
import { CATALOG_URL } from "../catalog/client";
import { NativeHttp } from "./native-http";

// Device-unique WebView UA pairs with Conscrypt (BoringSSL) in NativeHttpPlugin to pass Cloudflare's JA3 fingerprint check.
function getBrowserHeaders(): Record<string, string> {
	return {
		"User-Agent": navigator.userAgent,
		Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
		"Accept-Language": "en-US,en;q=0.5",
	};
}

/** Native: OkHttp+Conscrypt (Chrome JA3, CORS-bypassed). Web: catalog /proxy/article endpoint. */
export async function fetchHtml(url: string): Promise<string> {
	if (Capacitor.isNativePlatform()) {
		const res = await NativeHttp.request({ url, headers: getBrowserHeaders() });
		if (res.status === 403) throw new Error("CLOUDFLARE_CHALLENGE");
		if (res.status >= 400) throw new Error(`FETCH_FAILED:${res.status}`);
		return res.data;
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
