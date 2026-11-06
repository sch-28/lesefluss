import http, { type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const PUBLIC_IP = "127.0.0.1";
const fakeDns: Record<string, string> = {
	"public.test": PUBLIC_IP,
	"covers.royalroadcdn.com": PUBLIC_IP,
	"internal.test": "10.0.0.7",
};

// The routes use safeFetch's default deps; swap in a resolver where the
// loopback upstream counts as a public host and everything else is checked
// by the real blocklist.
vi.mock("../../lib/safe-fetch.js", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../lib/safe-fetch.js")>();
	const deps: import("../../lib/safe-fetch.js").SafeFetchDeps = {
		resolve: async (hostname) => {
			const address = fakeDns[hostname];
			if (!address) throw new Error(`ENOTFOUND ${hostname}`);
			return [{ address, family: 4 }];
		},
		isBlocked: (addr) => addr !== PUBLIC_IP && actual.isBlockedAddress(addr),
	};
	return {
		...actual,
		safeFetch: (url: string, init?: import("../../lib/safe-fetch.js").SafeFetchInit) =>
			actual.safeFetch(url, init, deps),
	};
});

const { proxyRoute } = await import("../proxy.js");

let handler: (req: IncomingMessage, res: ServerResponse) => void;
let server: http.Server;
let port: number;

beforeAll(async () => {
	server = http.createServer((req, res) => handler(req, res));
	port = await new Promise<number>((resolve) =>
		server.listen(0, PUBLIC_IP, () => resolve((server.address() as AddressInfo).port)),
	);
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
	handler = (_req, res) => {
		res.writeHead(200, { "content-type": "text/html" });
		res.end("<p>ok</p>");
	};
});

function redirectTo(location: string) {
	return (_req: IncomingMessage, res: ServerResponse) => {
		res.writeHead(302, { location });
		res.end();
	};
}

function postArticle(url: string) {
	return proxyRoute.request("/article", { method: "POST", body: JSON.stringify({ url }) });
}

describe("POST /proxy/article", () => {
	it("refuses an upstream that redirects to the cloud metadata address", async () => {
		handler = redirectTo("http://169.254.169.254/latest/meta-data/");

		const res = await postArticle(`http://public.test:${port}/story`);

		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: "blocked target" });
	});

	it("refuses an upstream that redirects to a host resolving to a private IP", async () => {
		handler = redirectTo("http://internal.test/admin");

		const res = await postArticle(`http://public.test:${port}/story`);

		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: "blocked target" });
	});

	it("answers 502 when the upstream redirects in a loop", async () => {
		handler = redirectTo("/again");

		const res = await postArticle(`http://public.test:${port}/story`);

		expect(res.status).toBe(502);
		expect(await res.json()).toEqual({ error: "upstream failed" });
	});

	// The web client reads the upstream status out of this body to tell a Cloudflare block apart.
	it("names the upstream status when the upstream answers an error", async () => {
		handler = (_req, res) => {
			res.writeHead(403);
			res.end();
		};

		const res = await postArticle(`http://public.test:${port}/story`);

		expect(res.status).toBe(502);
		expect(await res.json()).toEqual({ error: "upstream failed (403)" });
	});

	it("returns the article and the URL after redirects", async () => {
		const ok = handler;
		handler = (req, res) => (req.url === "/old" ? redirectTo("/new")(req, res) : ok(req, res));

		const res = await postArticle(`http://public.test:${port}/old`);

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			html: "<p>ok</p>",
			contentType: "text/html",
			finalUrl: `http://public.test:${port}/new`,
		});
	});
});

describe("GET /proxy/image", () => {
	it("refuses an allowed image host that redirects to a private IP", async () => {
		handler = redirectTo("http://192.168.1.1/router.png");
		const url = encodeURIComponent(`http://covers.royalroadcdn.com:${port}/cover.png`);

		const res = await proxyRoute.request(`/image?url=${url}`);

		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: "blocked target" });
	});
});
