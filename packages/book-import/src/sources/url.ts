import type { RawInput } from "../types";
import { displayHostname, isLikelyUrl, normalizeUrl } from "../utils/url-guards";

export type UrlSourceOptions = {
	catalogUrl: string;
};

/**
 * Fetch an article URL through the catalog proxy and return its HTML as a
 * `RawInput`. The proxy handles CORS + SSRF guards; the client only normalises
 * the URL and unpacks the response.
 *
 * Throws:
 *   - `Error("INVALID_URL")` — doesn't parse as http/https.
 *   - `Error("TOO_LARGE")` — upstream response exceeded 5MB.
 *   - `Error("FETCH_FAILED")` — any other non-2xx from the proxy.
 */
export async function fetchUrlToRawInput(
	url: string,
	options: UrlSourceOptions,
): Promise<{
	input: RawInput;
	finalUrl: string;
}>;
export async function fetchUrlToRawInput(
	url: string,
	options: UrlSourceOptions,
): Promise<{
	input: RawInput;
	finalUrl: string;
}> {
	const normalized = normalizeUrl(url);
	if (!isLikelyUrl(normalized)) throw new Error("INVALID_URL");
	const catalogUrl = normalizeCatalogUrl(options.catalogUrl);
	if (!catalogUrl) throw new Error("FETCH_FAILED");

	let res: Response;
	try {
		res = await fetch(`${catalogUrl}/proxy/article`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ url: normalized }),
		});
	} catch {
		throw new Error("FETCH_FAILED");
	}

	if (res.status === 413) throw new Error("TOO_LARGE");
	if (!res.ok) throw new Error("FETCH_FAILED");

	const data = (await res.json()) as { html?: string; finalUrl?: string };
	if (!data.html) throw new Error("FETCH_FAILED");

	const finalUrl = data.finalUrl ?? normalized;
	const bytes = new TextEncoder().encode(data.html).buffer as ArrayBuffer;

	return {
		finalUrl,
		input: {
			kind: "bytes",
			bytes,
			fileName: `${displayHostname(finalUrl)}.html`,
			mimeType: "text/html",
		},
	};
}

function normalizeCatalogUrl(raw: string): string {
	try {
		const url = new URL(raw);
		if (url.protocol !== "http:" && url.protocol !== "https:") return "";
		return url.toString().replace(/\/+$/, "");
	} catch {
		return "";
	}
}
