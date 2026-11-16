import { promises as dns, type LookupAddress } from "node:dns";
import http, { type IncomingHttpHeaders, type IncomingMessage } from "node:http";
import https from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { Readable, type Transform } from "node:stream";
import zlib from "node:zlib";

const MAX_REDIRECTS = 5;

const blockedRanges = new BlockList();
for (const [net, prefix] of [
	["0.0.0.0", 8],
	["10.0.0.0", 8],
	["100.64.0.0", 10], // CGNAT
	["127.0.0.0", 8],
	["169.254.0.0", 16], // link-local, incl. 169.254.169.254 cloud metadata
	["172.16.0.0", 12],
	["192.0.0.0", 24],
	["192.0.2.0", 24],
	["192.168.0.0", 16],
	["198.18.0.0", 15],
	["198.51.100.0", 24],
	["203.0.113.0", 24],
	["224.0.0.0", 3], // multicast, reserved, broadcast
] as const) {
	blockedRanges.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
	["::", 96], // unspecified, loopback, IPv4-compatible
	["::ffff:0:0:0", 96], // IPv4-translated (SIIT)
	["64:ff9b::", 96], // NAT64 embeds an IPv4 target
	["64:ff9b:1::", 48],
	["100::", 64], // discard
	["2001::", 32], // Teredo
	["2001:db8::", 32],
	["2002::", 16], // 6to4 embeds an IPv4 target
	["fc00::", 7], // ULA
	["fe80::", 10], // link-local
	["fec0::", 10], // site-local
	["ff00::", 8], // multicast
] as const) {
	blockedRanges.addSubnet(net, prefix, "ipv6");
}

/** IPv4-mapped IPv6 addresses (::ffff:a.b.c.d) are matched against the IPv4 ranges. */
export function isBlockedAddress(addr: string): boolean {
	const family = isIP(addr);
	if (family === 4) return blockedRanges.check(addr, "ipv4");
	if (family === 6) return blockedRanges.check(addr, "ipv6");
	return true;
}

export type ResolvedAddress = { address: string; family: 4 | 6 };

export type SafeFetchDeps = {
	resolve: (hostname: string) => Promise<ResolvedAddress[]>;
	isBlocked: (addr: string) => boolean;
};

const defaultDeps: SafeFetchDeps = {
	resolve: async (hostname) => {
		const results: LookupAddress[] = await dns.lookup(hostname, { all: true });
		return results.map((r) => ({ address: r.address, family: r.family === 6 ? 6 : 4 }));
	},
	isBlocked: isBlockedAddress,
};

export type SafeFetchError = {
	reason:
		| "invalid url"
		| "blocked target"
		| "dns lookup failed"
		| "too many redirects"
		| "upstream failed";
};

export type SafeFetchInit = {
	method?: "GET" | "POST";
	body?: string;
	headers?: Record<string, string>;
	signal?: AbortSignal;
};

export type SafeFetchResult = { res: Response; finalUrl: string };

/**
 * `fetch` for user-supplied URLs. Every hop of a redirect chain is resolved,
 * checked against the blocked ranges, and connected to the checked address,
 * so neither a redirect nor a DNS answer that changes between check and
 * connect (rebinding) can reach an internal host.
 */
export async function safeFetch(
	rawUrl: string,
	init: SafeFetchInit = {},
	deps: SafeFetchDeps = defaultDeps,
): Promise<SafeFetchResult | SafeFetchError> {
	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		return { reason: "invalid url" };
	}
	let method = init.method ?? "GET";
	let body = method === "POST" ? (init.body ?? "") : undefined;
	const headers = { ...init.headers };

	for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
		if (url.protocol !== "http:" && url.protocol !== "https:") return { reason: "blocked target" };

		const pinned = await resolveChecked(url.hostname, deps);
		if ("reason" in pinned) return pinned;

		let res: IncomingMessage;
		try {
			res = await requestPinned(url, pinned, { method, body, headers, signal: init.signal });
		} catch (err) {
			console.warn(`[safe-fetch] request to ${url.hostname} failed:`, err);
			return { reason: "upstream failed" };
		}

		const status = res.statusCode ?? 0;
		const location = res.headers.location;
		if (status >= 300 && status < 400 && status !== 304 && location) {
			res.destroy();
			try {
				url = new URL(location, url);
			} catch {
				return { reason: "upstream failed" };
			}
			// Same method rewrite as fetch: only 307/308 keep a POST and its body.
			if (status !== 307 && status !== 308 && method === "POST") {
				method = "GET";
				body = undefined;
				delete headers["Content-Type"];
			}
			continue;
		}

		try {
			return { res: toWebResponse(res), finalUrl: url.toString() };
		} catch (err) {
			// Response rejects some status lines Node parses, e.g. 999 or a non-ASCII reason.
			res.destroy();
			console.warn(`[safe-fetch] unusable response from ${url.hostname}:`, err);
			return { reason: "upstream failed" };
		}
	}
	return { reason: "too many redirects" };
}

async function resolveChecked(
	hostname: string,
	deps: SafeFetchDeps,
): Promise<ResolvedAddress[] | SafeFetchError> {
	const host = bareHost(hostname);
	const literal = isIP(host);
	let addresses: ResolvedAddress[];
	if (literal) {
		addresses = [{ address: host, family: literal === 6 ? 6 : 4 }];
	} else {
		try {
			addresses = await deps.resolve(host);
		} catch {
			return { reason: "dns lookup failed" };
		}
	}
	if (addresses.length === 0) return { reason: "dns lookup failed" };
	if (addresses.some((a) => deps.isBlocked(a.address))) return { reason: "blocked target" };
	return addresses;
}

/** URL keeps the brackets of an IPv6 literal in `hostname`. */
function bareHost(hostname: string): string {
	return hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;
}

/**
 * Request options that connect only to the checked `pinned` addresses (all of
 * them for Happy Eyeballs, which asks with `all: true`) while the URL's hostname stays the
 * Host header and the TLS SNI / certificate name.
 */
export function pinnedRequestOptions(
	url: URL,
	pinned: ResolvedAddress[],
	init: { method: string; headers: Record<string, string>; signal?: AbortSignal },
): https.RequestOptions {
	const host = bareHost(url.hostname);
	const [first] = pinned;
	if (!first) throw new Error("no pinned address");
	const lookup: LookupFunction = (_hostname, options, callback) => {
		if (options.all)
			callback(
				null,
				pinned.map((a) => ({ address: a.address, family: a.family })),
			);
		else callback(null, first.address, first.family);
	};
	return {
		protocol: url.protocol,
		host,
		port: url.port || undefined,
		path: `${url.pathname}${url.search}`,
		method: init.method,
		headers: { "Accept-Encoding": "gzip, deflate, br", ...init.headers },
		lookup,
		// SNI must not carry an IP literal.
		servername: isIP(host) ? undefined : host,
		signal: init.signal,
	};
}

function requestPinned(
	url: URL,
	pinned: ResolvedAddress[],
	init: { method: string; body?: string; headers: Record<string, string>; signal?: AbortSignal },
): Promise<IncomingMessage> {
	const options = pinnedRequestOptions(url, pinned, init);
	const transport = url.protocol === "https:" ? https : http;
	return new Promise((resolve, reject) => {
		const req = transport.request(options, resolve);
		req.on("error", reject);
		req.end(init.body);
	});
}

function toWebResponse(res: IncomingMessage): Response {
	const headers = toHeaders(res.headers);
	const decoded = decode(res, headers.get("content-encoding"));
	if (decoded !== res) {
		// The declared length and encoding describe the compressed bytes.
		headers.delete("content-encoding");
		headers.delete("content-length");
	}
	const status = res.statusCode ?? 502;
	const body =
		status === 204 || status === 205 || status === 304
			? null
			: (Readable.toWeb(decoded) as ReadableStream<Uint8Array>);
	return new Response(body, { status, statusText: res.statusMessage, headers });
}

function decode(res: IncomingMessage, encoding: string | null): Readable {
	const decoder = createDecoder(encoding?.trim().toLowerCase());
	if (!decoder) return res;
	res.on("error", (err) => decoder.destroy(err));
	// A cancelled reader destroys the decoder only; the socket must go too.
	decoder.on("close", () => res.destroy());
	return res.pipe(decoder);
}

function createDecoder(encoding: string | undefined): Transform | undefined {
	// Lenient flushing like undici, so a body missing its trailer still decodes.
	const flush = { flush: zlib.constants.Z_SYNC_FLUSH, finishFlush: zlib.constants.Z_SYNC_FLUSH };
	if (encoding === "gzip" || encoding === "x-gzip") return zlib.createGunzip(flush);
	if (encoding === "deflate") return zlib.createInflate(flush);
	if (encoding === "br") {
		return zlib.createBrotliDecompress({
			flush: zlib.constants.BROTLI_OPERATION_FLUSH,
			finishFlush: zlib.constants.BROTLI_OPERATION_FLUSH,
		});
	}
	return undefined;
}

function toHeaders(raw: IncomingHttpHeaders): Headers {
	const headers = new Headers();
	for (const [name, value] of Object.entries(raw)) {
		if (value === undefined) continue;
		if (Array.isArray(value)) for (const v of value) headers.append(name, v);
		else headers.set(name, value);
	}
	return headers;
}
