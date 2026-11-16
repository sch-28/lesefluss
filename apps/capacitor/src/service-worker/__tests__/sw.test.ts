import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const ORIGIN = "https://lesefluss.test";
const template = fs.readFileSync(path.resolve(__dirname, "../sw.js"), "utf8");

type Handler = (event: Record<string, unknown>) => void;

class FakeCache {
	entries = new Map<string, Response>();
	async match(key: string) {
		return this.entries.get(key)?.clone();
	}
	async put(key: string, response: Response) {
		this.entries.set(key, response);
	}
}

class FakeCaches {
	stores = new Map<string, FakeCache>();
	async open(name: string) {
		if (!this.stores.has(name)) this.stores.set(name, new FakeCache());
		return this.stores.get(name) as FakeCache;
	}
	async keys() {
		return [...this.stores.keys()];
	}
	async delete(name: string) {
		return this.stores.delete(name);
	}
	async match(key: string) {
		for (const store of this.stores.values()) {
			const hit = await store.match(key);
			if (hit) return hit;
		}
		return undefined;
	}
}

const FILES: [string, string][] = [
	["/app/index.html", "r-index"],
	["/app/assets/index-abc.js", "r-js"],
	["/app/manifest.webmanifest", "r-manifest"],
];

function response(body: string, type: string) {
	return new Response(body, { headers: { "content-type": type } });
}

const defaultServer = (url: string) =>
	url.endsWith(".html") ? response("<html>", "text/html") : response("code", "text/javascript");

function loadWorker(
	options: { files?: [string, string][]; version?: string; caches?: FakeCaches } = {},
) {
	const handlers = new Map<string, Handler>();
	const caches = options.caches ?? new FakeCaches();
	const server = vi.fn(async (input: string | Request) =>
		defaultServer(typeof input === "string" ? input : input.url),
	);
	const self = {
		location: { origin: ORIGIN },
		skipWaiting: vi.fn(),
		addEventListener: (type: string, handler: Handler) => handlers.set(type, handler),
		__LESEFLUSS_PRECACHE: {
			version: options.version ?? "v1",
			base: "/app/",
			files: options.files ?? FILES,
		},
	};
	new Function("self", "caches", "fetch", template)(self, caches, server);

	async function dispatch(type: string, event: Record<string, unknown>) {
		let waited: Promise<unknown> | undefined;
		let answer: Promise<Response> | undefined;
		handlers.get(type)?.({
			...event,
			waitUntil: (p: Promise<unknown>) => {
				waited = p;
			},
			respondWith: (p: Promise<Response>) => {
				answer = p;
			},
		});
		await waited;
		return answer;
	}

	const request = (url: string, init: { method?: string; mode?: string } = {}) => ({
		url: url.startsWith("http") ? url : `${ORIGIN}${url}`,
		method: init.method ?? "GET",
		mode: init.mode ?? "cors",
	});

	return { self, caches, server, dispatch, request };
}

describe("service worker install", () => {
	it("precaches every build file under its revision, bypassing the HTTP cache", async () => {
		const sw = loadWorker();
		await sw.dispatch("install", {});
		const cache = sw.caches.stores.get("lesefluss-shell-v1");
		expect([...(cache?.entries.keys() ?? [])].sort()).toEqual([
			`${ORIGIN}/app/assets/index-abc.js?__rev=r-js`,
			`${ORIGIN}/app/index.html?__rev=r-index`,
			`${ORIGIN}/app/manifest.webmanifest?__rev=r-manifest`,
		]);
		expect(sw.server).toHaveBeenCalledWith(`${ORIGIN}/app/assets/index-abc.js`, {
			cache: "no-cache",
			credentials: "same-origin",
		});
	});

	it("fails rather than store the app page under a script's name", async () => {
		const sw = loadWorker();
		sw.server.mockImplementation(async () => response("<html>", "text/html; charset=utf-8"));
		await expect(sw.dispatch("install", {})).rejects.toThrow(/HTML/);
	});

	it("fails on a missing file", async () => {
		const sw = loadWorker();
		sw.server.mockImplementation(async () => new Response("Not found", { status: 404 }));
		await expect(sw.dispatch("install", {})).rejects.toThrow(/404/);
	});

	it("downloads only the files whose revision changed", async () => {
		const first = loadWorker();
		await first.dispatch("install", {});
		const next = loadWorker({
			caches: first.caches,
			version: "v2",
			files: [
				["/app/index.html", "r-index-2"],
				["/app/assets/index-abc.js", "r-js"],
			],
		});
		await next.dispatch("install", {});
		expect(next.server).toHaveBeenCalledTimes(1);
		expect(next.server.mock.calls[0][0]).toBe(`${ORIGIN}/app/index.html`);

		await next.dispatch("activate", {});
		expect([...first.caches.stores.keys()]).toEqual(["lesefluss-shell-v2"]);
		const shell = first.caches.stores.get("lesefluss-shell-v2");
		expect([...(shell?.entries.keys() ?? [])].sort()).toEqual([
			`${ORIGIN}/app/assets/index-abc.js?__rev=r-js`,
			`${ORIGIN}/app/index.html?__rev=r-index-2`,
		]);
	});
});

describe("service worker activate", () => {
	it("drops older shells and leaves other caches", async () => {
		const caches = new FakeCaches();
		await caches.open("lesefluss-shell-old");
		await caches.open("someone-else");
		const sw = loadWorker({ caches });
		await sw.dispatch("install", {});
		await sw.dispatch("activate", {});
		expect([...caches.stores.keys()].sort()).toEqual(["lesefluss-shell-v1", "someone-else"]);
	});

	it("waits for the page's go before taking over", async () => {
		const sw = loadWorker();
		await sw.dispatch("message", { data: { type: "OTHER" } });
		expect(sw.self.skipWaiting).not.toHaveBeenCalled();
		await sw.dispatch("message", { data: { type: "SKIP_WAITING" } });
		expect(sw.self.skipWaiting).toHaveBeenCalledOnce();
	});
});

describe("service worker fetch", () => {
	async function installed() {
		const sw = loadWorker();
		await sw.dispatch("install", {});
		sw.server.mockClear();
		return sw;
	}

	it("answers a build file from the cache", async () => {
		const sw = await installed();
		const answer = await sw.dispatch("fetch", { request: sw.request("/app/assets/index-abc.js") });
		expect(await answer?.text()).toBe("code");
		expect(sw.server).not.toHaveBeenCalled();
	});

	it("answers an app navigation with the cached shell", async () => {
		const sw = await installed();
		for (const url of ["/app/", "/app/tabs/library", "/app/tabs/reader/42?x=1"]) {
			const answer = await sw.dispatch("fetch", {
				request: sw.request(url, { mode: "navigate" }),
			});
			expect(await answer?.text()).toBe("<html>");
		}
		expect(sw.server).not.toHaveBeenCalled();
	});

	it.each([
		["a server call", "/api/sync", {}],
		["a server call with a query", "/api/books?since=1", {}],
		["a write", "/app/assets/index-abc.js", { method: "POST" }],
		["another origin", "https://catalog.lesefluss.app/app/assets/index-abc.js", {}],
		["a navigation outside the app", "/login", { mode: "navigate" }],
		["a navigation to a missing file", "/app/assets/gone-123.js", { mode: "navigate" }],
		["a missing build file", "/app/assets/gone-123.js", {}],
		["a build file with a query", "/app/assets/index-abc.js?v=2", {}],
	])("leaves %s to the network", async (_name, url, init) => {
		const sw = await installed();
		const answer = await sw.dispatch("fetch", { request: sw.request(url, init) });
		expect(answer).toBeUndefined();
	});
});
