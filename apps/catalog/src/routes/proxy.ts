import { promises as dns } from "node:dns";
import { isIP } from "node:net";
import { Hono } from "hono";

export const proxyRoute = new Hono()
	// POST /proxy/article  { url }
	// → 200 { html, contentType, finalUrl }
	//   400 invalid URL / unsafe target
	//   413 response larger than MAX_BYTES
	//   502 upstream fetch failed
	//   415 upstream content-type is not HTML
	.post("/article", async (c) => {
		let body: { url?: unknown };
		try {
			body = await c.req.json();
		} catch {
			return c.json({ error: "invalid json" }, 400);
		}
		const rawUrl = typeof body.url === "string" ? body.url.trim() : "";
		if (!rawUrl) return c.json({ error: "missing url" }, 400);

		let parsed: URL;
		try {
			parsed = new URL(rawUrl);
		} catch {
			return c.json({ error: "invalid url" }, 400);
		}
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			return c.json({ error: "unsupported protocol" }, 400);
		}

		// Block requests to private IPs (SSRF). Covers both IP-literal hostnames
		// and names that resolve to private ranges via DNS. Defense-in-depth,
		// not air-tight — DNS rebinding could theoretically defeat the gap
		// between check and fetch (TODO: close the window by fetching the
		// resolved IP directly with a Host header override).
		try {
			const addresses = await resolveAll(parsed.hostname);
			if (addresses.some((a) => isPrivateAddress(a))) {
				return c.json({ error: "blocked target" }, 400);
			}
		} catch {
			return c.json({ error: "dns lookup failed" }, 400);
		}

		let upstream: Response;
		try {
			upstream = await fetch(parsed.toString(), {
				redirect: "follow",
				signal: AbortSignal.timeout(10_000),
				headers: {
					// Bare UA — many sites return 403 to the default `node-fetch` one.
					"User-Agent": "Mozilla/5.0 (compatible; LesefussBot/1.0; +https://lesefluss.app/bot)",
					Accept: "text/html,application/xhtml+xml",
				},
			});
		} catch (err) {
			console.warn("[proxy/article] upstream fetch failed:", err);
			return c.json({ error: "upstream failed" }, 502);
		}

		if (!upstream.ok || !upstream.body) {
			return c.json({ error: "upstream failed" }, 502);
		}

		const contentType = upstream.headers.get("content-type") ?? "";
		if (!/^text\/html|^application\/xhtml\+xml/i.test(contentType)) {
			return c.json({ error: "unsupported content-type" }, 415);
		}

		const declaredLen = Number(upstream.headers.get("content-length"));
		if (Number.isFinite(declaredLen) && declaredLen > MAX_BYTES) {
			return c.json({ error: "too large" }, 413);
		}

		// Stream with a hard cap. Chunked responses omit content-length, so we
		// only know after reading.
		const reader = upstream.body.getReader();
		const chunks: Uint8Array[] = [];
		let total = 0;
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				total += value.byteLength;
				if (total > MAX_BYTES) {
					await reader.cancel();
					return c.json({ error: "too large" }, 413);
				}
				chunks.push(value);
			}
		} catch (err) {
			console.warn("[proxy/article] stream read failed:", err);
			return c.json({ error: "upstream failed" }, 502);
		}

		const buf = concatChunks(chunks, total);
		const html = decodeHtml(buf, contentType);

		return c.json({
			html,
			contentType,
			finalUrl: upstream.url,
		});
	});

const MAX_BYTES = 5 * 1024 * 1024; // 5MB

async function resolveAll(hostname: string): Promise<string[]> {
	// IP literals: use as-is.
	if (isIP(hostname)) return [hostname];
	const results = await dns.lookup(hostname, { all: true });
	return results.map((r) => r.address);
}

function isPrivateAddress(addr: string): boolean {
	const v = isIP(addr);
	if (v === 4) return isPrivateIPv4(addr);
	if (v === 6) return isPrivateIPv6(addr);
	return true; // unknown → refuse
}

function isPrivateIPv4(addr: string): boolean {
	const parts = addr.split(".").map((n) => Number.parseInt(n, 10));
	if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return true;
	const a = parts[0] as number;
	const b = parts[1] as number;
	if (a === 10) return true; // 10.0.0.0/8
	if (a === 127) return true; // loopback
	if (a === 169 && b === 254) return true; // link-local (incl. 169.254.169.254 metadata)
	if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
	if (a === 192 && b === 168) return true; // 192.168.0.0/16
	if (a === 0) return true; // 0.0.0.0/8
	if (a >= 224) return true; // multicast + reserved
	return false;
}

function isPrivateIPv6(addr: string): boolean {
	const lower = addr.toLowerCase();
	if (lower === "::1" || lower === "::") return true; // loopback + unspecified
	if (lower.startsWith("fe80:")) return true; // link-local
	if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA fc00::/7
	if (lower.startsWith("ff")) return true; // multicast
	// IPv4-mapped (::ffff:a.b.c.d) — check the embedded v4 address.
	if (lower.startsWith("::ffff:")) {
		const v4 = lower.slice(7);
		if (isIP(v4) === 4) return isPrivateIPv4(v4);
	}
	return false;
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
