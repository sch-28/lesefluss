import { Hono } from "hono";
import { safeFetch } from "../lib/safe-fetch.js";

const MAX_ARTICLE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB — covers occasionally exceed 5MB before TASK-100 lands
const MAX_ARTICLE_REQUEST_BYTES = 8 * 1024;
const MAX_UPSTREAM_POST_BYTES = 1024;
const UPSTREAM_TIMEOUT_MS = 10_000;
const UPSTREAM_USER_AGENT = "Mozilla/5.0 (compatible; LesefussBot/1.0; +https://lesefluss.app/bot)";

/**
 * Hostnames the image proxy is allowed to fetch from. Without this anyone could
 * use `/proxy/image?url=...` as a free image CDN: SSRF guards block private
 * targets and the size cap bounds individual responses, but bandwidth abuse
 * (an attacker pulling 8MB images at the rate-limit ceiling) would still cost
 * us real egress. Restrict to the providers our adapters actually support.
 *
 * Suffix match — `royalroadcdn.com` matches `www.royalroadcdn.com` etc.
 */
const IMAGE_HOST_ALLOWLIST = [
	"archiveofourown.org",
	"royalroad.com",
	"royalroadcdn.com",
	"scribblehub.com",
	"wuxiaworld.com",
];

type ProxyError = { status: 400 | 413 | 415 | 502; body: { error: string } };
type ValidatedUrl = { url: URL };

export const proxyRoute = new Hono()
	// POST /proxy/article  { url }
	// → 200 { html, contentType, finalUrl }
	//   400 invalid URL / unsafe target
	//   413 response larger than MAX_ARTICLE_BYTES
	//   415 upstream content-type is neither HTML nor JSON
	//   502 upstream fetch failed
	.post("/article", async (c) => {
		let body: { url?: unknown; method?: unknown; body?: unknown; contentType?: unknown };
		try {
			body = JSON.parse(await readRequestText(c.req.raw, MAX_ARTICLE_REQUEST_BYTES));
			if (!body || typeof body !== "object") throw new Error("invalid body");
		} catch (err) {
			if (err instanceof RequestTooLargeError) return c.json({ error: "too large" }, 413);
			return c.json({ error: "invalid json" }, 400);
		}
		const rawUrl = typeof body.url === "string" ? body.url.trim() : "";
		const method = body.method === "POST" ? "POST" : "GET";
		let upstreamBody = method === "POST" && typeof body.body === "string" ? body.body : undefined;
		let reqContentType =
			method === "POST" && typeof body.contentType === "string"
				? body.contentType
				: "application/x-www-form-urlencoded";
		if (method === "POST" && upstreamBody && byteLength(upstreamBody) > MAX_UPSTREAM_POST_BYTES) {
			return c.json({ error: "too large" }, 413);
		}

		const validated = validateUrl(rawUrl);
		if ("status" in validated) return c.json(validated.body, validated.status);
		if (method === "POST") {
			const postCheck = validateArticlePost(validated.url, upstreamBody, reqContentType);
			if ("status" in postCheck) return c.json(postCheck.body, postCheck.status);
			upstreamBody = postCheck.body;
			reqContentType = postCheck.contentType;
		}

		const fetched = await fetchUpstream(
			validated.url,
			"text/html,application/xhtml+xml",
			"article",
			{ method, body: upstreamBody, contentType: reqContentType },
		);
		if ("status" in fetched) return c.json(fetched.body, fetched.status);
		const upstream = fetched.res;

		const contentType = upstream.headers.get("content-type") ?? "";
		// Accept HTML (most adapters) and JSON (e.g. Wuxiaworld's first-party search API).
		// `fetchHtml` on the client reads `data.html` as an opaque string in either case.
		if (!/^text\/html|^application\/xhtml\+xml|^application\/json/i.test(contentType)) {
			return c.json({ error: "unsupported content-type" }, 415);
		}

		const declaredLen = Number(upstream.headers.get("content-length"));
		if (Number.isFinite(declaredLen) && declaredLen > MAX_ARTICLE_BYTES) {
			return c.json({ error: "too large" }, 413);
		}

		const articleBody = upstream.body;
		if (!articleBody) return c.json({ error: "upstream failed" }, 502);
		const read = await readWithCap(articleBody, MAX_ARTICLE_BYTES, "article");
		if ("status" in read) return c.json(read.body, read.status);

		const html = decodeHtml(read.buf, contentType);
		return c.json({ html, contentType, finalUrl: fetched.finalUrl });
	})
	// GET /proxy/image?url=<encoded>
	// → 200 image bytes (cache-friendly headers, streamed straight from upstream)
	//   400 invalid / unsafe URL / disallowed host
	//   413 response larger than MAX_IMAGE_BYTES (declared length only — stream-time
	//       overflow tears the connection rather than emitting a clean 413, since
	//       headers are already on the wire)
	//   415 upstream content-type is not an image
	//   502 upstream fetch failed
	//
	// Why this exists: web-build CSP locks `img-src` to self + the catalog origin,
	// so cover images that web-novel adapters return as raw upstream URLs (e.g.
	// royalroadcdn.com) cannot be loaded directly by `<img>`. The client wraps
	// such URLs through this proxy on web only — native WebView loads them fine.
	.get("/image", async (c) => {
		const rawUrl = c.req.query("url")?.trim() ?? "";

		const validated = validateUrl(rawUrl);
		if ("status" in validated) return c.json(validated.body, validated.status);

		if (!isAllowedImageHost(validated.url.hostname)) {
			return c.json({ error: "host not allowed" }, 400);
		}

		const fetched = await fetchUpstream(validated.url, "image/*", "image");
		if ("status" in fetched) return c.json(fetched.body, fetched.status);
		const upstream = fetched.res;

		const contentType = upstream.headers.get("content-type") ?? "";
		if (!/^image\//i.test(contentType)) {
			return c.json({ error: "unsupported content-type" }, 415);
		}

		const declaredLen = Number(upstream.headers.get("content-length"));
		if (Number.isFinite(declaredLen) && declaredLen > MAX_IMAGE_BYTES) {
			return c.json({ error: "too large" }, 413);
		}

		// Stream-through with a running cap. Avoids buffering the full image in
		// memory and scales to many concurrent requests (vs. ~8MB × N for buffered).
		const limiter = capByteStream(MAX_IMAGE_BYTES);
		const headers: Record<string, string> = {
			"content-type": contentType,
			// Most providers cache-bust covers via query string, so the URL is the
			// version key. Skip `immutable` so a no-cache-buster URL can refresh
			// after the 24h window.
			"cache-control": "public, max-age=86400",
		};
		if (Number.isFinite(declaredLen) && declaredLen > 0) {
			headers["content-length"] = String(declaredLen);
		}

		const imageBody = upstream.body;
		if (!imageBody) return c.json({ error: "upstream failed" }, 502);
		return new Response(imageBody.pipeThrough(limiter), { status: 200, headers });
	});

/** The SSRF check itself runs per redirect hop in `safeFetch`. */
function validateUrl(rawUrl: string): ValidatedUrl | ProxyError {
	if (!rawUrl) return { status: 400, body: { error: "missing url" } };

	let parsed: URL;
	try {
		parsed = new URL(rawUrl);
	} catch {
		return { status: 400, body: { error: "invalid url" } };
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		return { status: 400, body: { error: "unsupported protocol" } };
	}

	return { url: parsed };
}

/**
 * Fetch `url` upstream with the standard UA + timeout. Returns the Response and
 * the URL after redirects, or a structured error the caller can pass to `c.json`.
 */
async function fetchUpstream(
	url: URL,
	accept: string,
	tag: string,
	opts: { method?: "GET" | "POST"; body?: string; contentType?: string } = {},
): Promise<{ res: Response; finalUrl: string } | ProxyError> {
	const method = opts.method ?? "GET";
	const headers: Record<string, string> = {
		// Bare UA — many sites return 403 to the default `node-fetch` one.
		"User-Agent": UPSTREAM_USER_AGENT,
		Accept: accept,
	};
	if (method === "POST" && opts.contentType) {
		headers["Content-Type"] = opts.contentType;
	}
	const fetched = await safeFetch(url.toString(), {
		method,
		body: method === "POST" ? (opts.body ?? "") : undefined,
		signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
		headers,
	});
	if ("reason" in fetched) {
		if (fetched.reason === "upstream failed" || fetched.reason === "too many redirects") {
			return { status: 502, body: { error: "upstream failed" } };
		}
		return { status: 400, body: { error: fetched.reason } };
	}
	const { res, finalUrl } = fetched;
	if (!res.ok || !res.body) {
		console.warn(
			`[proxy/${tag}] upstream returned ${res.status} for ${url.hostname}${url.pathname}`,
		);
		return { status: 502, body: { error: `upstream failed (${res.status})` } };
	}
	return { res, finalUrl };
}

/**
 * Drain `body` into a single Uint8Array, enforcing a hard size cap. Used by
 * `/article` because the body must be decoded as text. `/image` uses
 * `capByteStream` instead so it can pipe through without buffering.
 */
async function readWithCap(
	body: ReadableStream<Uint8Array>,
	maxBytes: number,
	tag: string,
): Promise<{ buf: Uint8Array } | ProxyError> {
	const reader = body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > maxBytes) {
				await reader.cancel();
				return { status: 413, body: { error: "too large" } };
			}
			chunks.push(value);
		}
	} catch (err) {
		console.warn(`[proxy/${tag}] stream read failed:`, err);
		return { status: 502, body: { error: "upstream failed" } };
	}
	return { buf: concatChunks(chunks, total) };
}

/**
 * TransformStream that passes bytes through but errors the stream once the
 * running total exceeds `maxBytes`. The downstream Response will be torn
 * (TCP reset / chunked-transfer error) — fine, since proxied images are a
 * pure replay path with no committed state to roll back.
 */
function capByteStream(maxBytes: number): TransformStream<Uint8Array, Uint8Array> {
	let total = 0;
	return new TransformStream<Uint8Array, Uint8Array>({
		transform(chunk, controller) {
			total += chunk.byteLength;
			if (total > maxBytes) {
				controller.error(new Error("RESPONSE_TOO_LARGE"));
				return;
			}
			controller.enqueue(chunk);
		},
	});
}

function isAllowedImageHost(hostname: string): boolean {
	const lower = hostname.toLowerCase();
	return IMAGE_HOST_ALLOWLIST.some((allowed) => lower === allowed || lower.endsWith(`.${allowed}`));
}

function validateArticlePost(
	url: URL,
	body: string | undefined,
	contentType: string,
): ProxyError | { body: string; contentType: string } {
	if (
		url.protocol !== "https:" ||
		url.hostname !== "www.scribblehub.com" ||
		url.pathname !== "/wp-admin/admin-ajax.php"
	) {
		return { status: 400, body: { error: "post target not allowed" } };
	}
	if (!/^application\/x-www-form-urlencoded\b/i.test(contentType)) {
		return { status: 415, body: { error: "unsupported content-type" } };
	}
	const params = new URLSearchParams(body ?? "");
	if (params.get("action") !== "wi_getreleases_pagination") {
		return { status: 400, body: { error: "post action not allowed" } };
	}
	const pageRaw = params.get("pagenum") ?? "";
	const postId = params.get("mypostid") ?? "";
	if (!/^\d{1,4}$/.test(pageRaw) || !/^\d{1,12}$/.test(postId)) {
		return { status: 400, body: { error: "invalid post payload" } };
	}
	const page = Number(pageRaw);
	if (page < 1 || page > 1000) {
		return { status: 400, body: { error: "invalid post payload" } };
	}
	return {
		body: new URLSearchParams({
			action: "wi_getreleases_pagination",
			pagenum: String(page),
			mypostid: postId,
		}).toString(),
		contentType: "application/x-www-form-urlencoded",
	};
}

class RequestTooLargeError extends Error {}

async function readRequestText(request: Request, maxBytes: number): Promise<string> {
	const declared = Number(request.headers.get("content-length"));
	if (Number.isFinite(declared) && declared > maxBytes) throw new RequestTooLargeError();
	if (!request.body) return "";

	const reader = request.body.getReader();
	const decoder = new TextDecoder();
	let total = 0;
	let text = "";
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > maxBytes) {
			await reader.cancel();
			throw new RequestTooLargeError();
		}
		text += decoder.decode(value, { stream: true });
	}
	return text + decoder.decode();
}

function byteLength(value: string): number {
	return new TextEncoder().encode(value).byteLength;
}

function concatChunks(chunks: Uint8Array[], total: number): Uint8Array {
	const out = new Uint8Array(total);
	let offset = 0;
	for (const c of chunks) {
		out.set(c, offset);
		offset += c.byteLength;
	}
	return out;
}

function decodeHtml(buf: Uint8Array, contentType: string): string {
	const m = contentType.match(/charset=([^;]+)/i);
	const charset = m?.[1]?.trim().toLowerCase() ?? "utf-8";
	try {
		return new TextDecoder(charset, { fatal: false }).decode(buf);
	} catch {
		return new TextDecoder("utf-8", { fatal: false }).decode(buf);
	}
}
