// The web build's service worker. The build prepends `self.__LESEFLUSS_PRECACHE`
// (see vite.config.ts) with the shell's files and a revision per file.
// Only precached files and app navigations are answered here; every other
// request, the server API above all, goes to the network untouched.

const { version, base, files } = self.__LESEFLUSS_PRECACHE;
const CACHE_PREFIX = "lesefluss-shell-";
const CACHE = `${CACHE_PREFIX}${version}`;
const SHELL = new URL(`${base}index.html`, self.location.origin).href;
const revisions = new Map(
	files.map(([path, rev]) => [new URL(path, self.location.origin).href, rev]),
);
const FILE_PATH = /\/[^/]+\.[a-z0-9]+$/i;

const cacheKey = (href) => `${href}?__rev=${revisions.get(href)}`;

/** A redirected response cannot answer a navigation, so it is stored as a plain one. */
function storable(response) {
	if (!response.redirected) return response;
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: response.headers,
	});
}

async function precacheOne(cache, href) {
	const key = cacheKey(href);
	const kept = await caches.match(key);
	if (kept) return cache.put(key, kept);
	const response = await fetch(href, { cache: "no-cache", credentials: "same-origin" });
	if (!response.ok) throw new Error(`precache ${href}: ${response.status}`);
	// An HTML page under a script or style name would run as that file in the next start.
	const type = response.headers.get("content-type") ?? "";
	if (href !== SHELL && type.includes("text/html")) throw new Error(`precache ${href}: HTML`);
	return cache.put(key, storable(response));
}

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => Promise.all([...revisions.keys()].map((href) => precacheOne(cache, href)))),
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((names) =>
				Promise.all(
					names
						.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE)
						.map((name) => caches.delete(name)),
				),
			),
	);
});

self.addEventListener("message", (event) => {
	if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

async function fromCache(href, request) {
	const cache = await caches.open(CACHE);
	return (await cache.match(cacheKey(href))) ?? fetch(request);
}

self.addEventListener("fetch", (event) => {
	const request = event.request;
	if (request.method !== "GET") return;
	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;
	const href = `${url.origin}${url.pathname}`;
	if (!url.search && revisions.has(href)) {
		event.respondWith(fromCache(href, request));
		return;
	}
	if (
		request.mode === "navigate" &&
		url.pathname.startsWith(base) &&
		!FILE_PATH.test(url.pathname)
	) {
		event.respondWith(fromCache(SHELL, request));
	}
});
