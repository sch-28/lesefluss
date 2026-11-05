import http, { type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
	isBlockedAddress,
	pinnedRequestOptions,
	type ResolvedAddress,
	type SafeFetchDeps,
	safeFetch,
} from "../safe-fetch.js";

// 127.0.0.1 plays the public upstream; 127.0.0.2 is an internal host the
// proxy must never reach. Both listen on the same port, so a fetch that
// ignored the pinned address and re-resolved would land on the wrong one.
const PUBLIC_IP = "127.0.0.1";
const INTERNAL_IP = "127.0.0.2";

type Handler = (req: IncomingMessage, res: ServerResponse) => void;
let publicHandler: Handler;
const publicHits: IncomingMessage[] = [];
const internalHits: IncomingMessage[] = [];
let port: number;
let publicServer: http.Server;
let internalServer: http.Server;

function listen(server: http.Server, host: string, wantPort = 0): Promise<number> {
	return new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(wantPort, host, () => resolve((server.address() as AddressInfo).port));
	});
}

beforeAll(async () => {
	publicServer = http.createServer((req, res) => {
		publicHits.push(req);
		publicHandler(req, res);
	});
	internalServer = http.createServer((req, res) => {
		internalHits.push(req);
		res.end("internal secret");
	});
	port = await listen(publicServer, PUBLIC_IP);
	await listen(internalServer, INTERNAL_IP, port);
});

afterAll(async () => {
	await Promise.all(
		[publicServer, internalServer].map((s) => new Promise((r) => s.close(() => r(null)))),
	);
});

beforeEach(() => {
	publicHits.length = 0;
	internalHits.length = 0;
	publicHandler = (_req, res) => res.end("ok");
});

function depsWith(dns: Record<string, string | (() => string)>) {
	const calls: string[] = [];
	const deps: SafeFetchDeps = {
		resolve: async (hostname) => {
			calls.push(hostname);
			const entry = dns[hostname];
			if (!entry) throw new Error(`ENOTFOUND ${hostname}`);
			const address = typeof entry === "function" ? entry() : entry;
			return [{ address, family: address.includes(":") ? 6 : 4 }];
		},
		isBlocked: (addr) => addr !== PUBLIC_IP && isBlockedAddress(addr),
	};
	return { deps, calls };
}

function redirectTo(location: string, status = 302): Handler {
	return (_req, res) => {
		res.writeHead(status, { location });
		res.end();
	};
}

describe("safeFetch redirects", () => {
	it("refuses a redirect to the cloud metadata address", async () => {
		publicHandler = redirectTo("http://169.254.169.254/latest/meta-data/");
		const { deps } = depsWith({ "public.test": PUBLIC_IP });

		const result = await safeFetch(`http://public.test:${port}/`, {}, deps);

		expect(result).toEqual({ reason: "blocked target" });
		expect(publicHits).toHaveLength(1);
	});

	it("refuses a redirect to a host that resolves to an internal IP", async () => {
		publicHandler = redirectTo(`http://internal.test:${port}/admin`);
		const { deps } = depsWith({ "public.test": PUBLIC_IP, "internal.test": INTERNAL_IP });

		const result = await safeFetch(`http://public.test:${port}/`, {}, deps);

		expect(result).toEqual({ reason: "blocked target" });
		expect(internalHits).toHaveLength(0);
	});

	it("refuses a redirect to an IPv4-mapped IPv6 literal of an internal IP", async () => {
		publicHandler = redirectTo(`http://[::ffff:${INTERNAL_IP}]:${port}/`);
		const { deps } = depsWith({ "public.test": PUBLIC_IP });

		const result = await safeFetch(`http://public.test:${port}/`, {}, deps);

		expect(result).toEqual({ reason: "blocked target" });
		expect(internalHits).toHaveLength(0);
	});

	it("refuses a redirect to a non-http scheme", async () => {
		publicHandler = redirectTo("file:///etc/passwd");
		const { deps } = depsWith({ "public.test": PUBLIC_IP });

		expect(await safeFetch(`http://public.test:${port}/`, {}, deps)).toEqual({
			reason: "blocked target",
		});
	});

	it("follows a redirect between public hosts and reports the final URL", async () => {
		publicHandler = (req, res) => {
			if (req.url === "/start") return redirectTo("/end?x=1", 301)(req, res);
			res.writeHead(200, { "content-type": "text/html" });
			res.end(`${req.method} ${req.url}`);
		};
		const { deps } = depsWith({ "public.test": PUBLIC_IP });

		const result = await safeFetch(`http://public.test:${port}/start`, {}, deps);

		if ("reason" in result) throw new Error(result.reason);
		expect(result.finalUrl).toBe(`http://public.test:${port}/end?x=1`);
		expect(result.res.headers.get("content-type")).toBe("text/html");
		expect(await result.res.text()).toBe("GET /end?x=1");
	});

	it("turns a POST into a GET on a 302, like fetch", async () => {
		publicHandler = (req, res) => {
			if (req.url === "/post") return redirectTo("/after")(req, res);
			res.end(`${req.method} ${req.headers["content-type"] ?? "none"}`);
		};
		const { deps } = depsWith({ "public.test": PUBLIC_IP });

		const result = await safeFetch(
			`http://public.test:${port}/post`,
			{
				method: "POST",
				body: "a=1",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
			},
			deps,
		);

		if ("reason" in result) throw new Error(result.reason);
		expect(await result.res.text()).toBe("GET none");
	});

	it("keeps a POST and its body on a 307", async () => {
		publicHandler = (req, res) => {
			if (req.url === "/post") return redirectTo("/after", 307)(req, res);
			let body = "";
			req.on("data", (chunk) => {
				body += chunk;
			});
			req.on("end", () => res.end(`${req.method} ${body}`));
		};
		const { deps } = depsWith({ "public.test": PUBLIC_IP });

		const result = await safeFetch(
			`http://public.test:${port}/post`,
			{ method: "POST", body: "a=1" },
			deps,
		);

		if ("reason" in result) throw new Error(result.reason);
		expect(await result.res.text()).toBe("POST a=1");
	});

	it("gives up after five redirects", async () => {
		publicHandler = redirectTo("/again");
		const { deps } = depsWith({ "public.test": PUBLIC_IP });

		const result = await safeFetch(`http://public.test:${port}/`, {}, deps);

		expect(result).toEqual({ reason: "too many redirects" });
		expect(publicHits).toHaveLength(6);
	});
});

describe("safeFetch DNS pinning", () => {
	it("connects to the checked address when the host re-resolves to an internal IP", async () => {
		let lookups = 0;
		const { deps, calls } = depsWith({
			"rebind.test": () => (lookups++ === 0 ? PUBLIC_IP : INTERNAL_IP),
		});

		const result = await safeFetch(`http://rebind.test:${port}/page`, {}, deps);

		if ("reason" in result) throw new Error(result.reason);
		expect(await result.res.text()).toBe("ok");
		expect(calls).toEqual(["rebind.test"]);
		expect(publicHits).toHaveLength(1);
		expect(publicHits[0]?.headers.host).toBe(`rebind.test:${port}`);
		expect(internalHits).toHaveLength(0);
	});

	it("refuses a host when any of its addresses is internal", async () => {
		const deps: SafeFetchDeps = {
			resolve: async () => [
				{ address: "93.184.216.34", family: 4 },
				{ address: "10.0.0.1", family: 4 },
			],
			isBlocked: isBlockedAddress,
		};

		expect(await safeFetch("http://mixed.test/", {}, deps)).toEqual({ reason: "blocked target" });
	});

	it("reports a failed lookup", async () => {
		const { deps } = depsWith({});
		expect(await safeFetch("http://missing.test/", {}, deps)).toEqual({
			reason: "dns lookup failed",
		});
	});

	it("keeps the hostname for SNI and Host on HTTPS while connecting to the pinned IP", () => {
		const pinned: ResolvedAddress[] = [
			{ address: "93.184.216.34", family: 4 },
			{ address: "2606:2800:220:1::1", family: 6 },
		];
		const options = pinnedRequestOptions(
			new URL("https://www.royalroad.com/fiction/1?p=2"),
			pinned,
			{
				method: "GET",
				headers: {},
			},
		);

		expect(options.host).toBe("www.royalroad.com");
		expect(options.servername).toBe("www.royalroad.com");
		expect(options.path).toBe("/fiction/1?p=2");

		const single: unknown[] = [];
		options.lookup?.("www.royalroad.com", {}, (...args: unknown[]) => single.push(...args));
		expect(single).toEqual([null, "93.184.216.34", 4]);

		const all: unknown[] = [];
		options.lookup?.("www.royalroad.com", { all: true }, (...args: unknown[]) => all.push(...args));
		expect(all).toEqual([null, pinned]);
	});
});

describe("safeFetch responses", () => {
	it("reports a status the Response constructor rejects as an upstream failure", async () => {
		publicHandler = (_req, res) => {
			res.writeHead(999);
			res.end("nope");
		};
		const { deps } = depsWith({ "public.test": PUBLIC_IP });

		expect(await safeFetch(`http://public.test:${port}/`, {}, deps)).toEqual({
			reason: "upstream failed",
		});
	});

	it("stops a hanging upstream when the signal aborts", async () => {
		publicHandler = () => {};
		const { deps } = depsWith({ "public.test": PUBLIC_IP });
		const controller = new AbortController();
		const pending = safeFetch(`http://public.test:${port}/`, { signal: controller.signal }, deps);
		await new Promise((r) => setImmediate(r));
		controller.abort();

		expect(await pending).toEqual({ reason: "upstream failed" });
	});

	it("decodes a gzip body that lacks its trailer", async () => {
		publicHandler = (_req, res) => {
			const gz = gzipSync("hello world");
			res.writeHead(200, { "content-encoding": "gzip" });
			res.end(gz.subarray(0, gz.byteLength - 8));
		};
		const { deps } = depsWith({ "public.test": PUBLIC_IP });

		const result = await safeFetch(`http://public.test:${port}/`, {}, deps);

		if ("reason" in result) throw new Error(result.reason);
		expect(await result.res.text()).toBe("hello world");
	});

	it("decodes a gzip body and drops the compressed length", async () => {
		const payload = "<p>hello</p>";
		publicHandler = (_req, res) => {
			const gz = gzipSync(payload);
			res.writeHead(200, { "content-encoding": "gzip", "content-length": gz.byteLength });
			res.end(gz);
		};
		const { deps } = depsWith({ "public.test": PUBLIC_IP });

		const result = await safeFetch(`http://public.test:${port}/`, {}, deps);

		if ("reason" in result) throw new Error(result.reason);
		expect(result.res.headers.get("content-length")).toBeNull();
		expect(await result.res.text()).toBe(payload);
	});
});

describe("isBlockedAddress", () => {
	it.each([
		"10.1.2.3",
		"127.0.0.1",
		"169.254.169.254",
		"172.16.0.1",
		"172.31.255.255",
		"192.168.1.1",
		"100.64.0.1",
		"100.127.255.255",
		"0.0.0.0",
		"224.0.0.1",
		"255.255.255.255",
		"::",
		"::1",
		"fe80::1",
		"fc00::1",
		"fd12:3456::1",
		"ff02::1",
		"::ffff:127.0.0.1",
		"::ffff:a9fe:a9fe",
		"::ffff:10.0.0.1",
		"::ffff:0:a9fe:a9fe",
		"64:ff9b::a9fe:a9fe",
		"2002:a9fe:a9fe::1",
		"not-an-ip",
	])("blocks %s", (addr) => {
		expect(isBlockedAddress(addr)).toBe(true);
	});

	it.each([
		"93.184.216.34",
		"1.1.1.1",
		"100.128.0.1",
		"172.32.0.1",
		"2606:4700:4700::1111",
	])("allows %s", (addr) => {
		expect(isBlockedAddress(addr)).toBe(false);
	});
});
