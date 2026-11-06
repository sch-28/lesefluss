import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({
	Capacitor: {
		isNativePlatform: () => false,
		getPlatform: () => "web",
	},
}));

vi.mock("../native-http", () => ({ NativeHttp: {} }));

import { fetchHtml } from "../fetch";

const MOBILE_APP_HINT = "open it in the mobile app";
const mockFetch = vi.fn();

function proxyAnswers(status: number, body: unknown) {
	mockFetch.mockResolvedValue(
		new Response(JSON.stringify(body), {
			status,
			headers: { "Content-Type": "application/json" },
		}),
	);
}

async function failureOf(): Promise<string> {
	const err = await fetchHtml("https://x.test/a").catch((e: unknown) => e);
	expect(err).toBeInstanceOf(Error);
	return (err as Error).message;
}

beforeEach(() => {
	mockFetch.mockReset();
	vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("fetchHtml web proxy failures", () => {
	it.each([
		"403",
		"503",
	])("points to the mobile app when the upstream answered %s", async (code) => {
		proxyAnswers(502, { error: `upstream failed (${code})` });
		expect(await failureOf()).toContain(MOBILE_APP_HINT);
	});

	it.each([
		[400, "invalid url", "This link isn't valid or can't be loaded."],
		[400, "blocked target", "This link isn't valid or can't be loaded."],
		[400, "dns lookup failed", "Couldn't find this site. Try again later."],
		[415, "unsupported content-type", "This page isn't a web page that can be read here."],
		[429, "rate limit exceeded", "Too many requests. Try again in a minute."],
		[502, "upstream failed", "Couldn't reach the site. Try again later."],
		[502, "upstream failed (404)", "The site answered with an error (404)."],
		[502, "upstream failed (500)", "The site answered with an error (500)."],
	])("names what failed for %i %s, without the mobile-app hint", async (status, error, message) => {
		proxyAnswers(status, { error });
		const text = await failureOf();
		expect(text).toBe(message);
		expect(text).not.toContain(MOBILE_APP_HINT);
	});

	it("still names the status when the proxy body is not JSON", async () => {
		mockFetch.mockResolvedValue(new Response("Bad Gateway", { status: 504 }));
		const text = await failureOf();
		expect(text).toBe("Couldn't load this page (504).");
	});

	it("keeps TOO_LARGE for a 413", async () => {
		proxyAnswers(413, { error: "too large" });
		expect(await failureOf()).toBe("TOO_LARGE");
	});

	it("returns the html on success", async () => {
		proxyAnswers(200, { html: "<p>ok</p>" });
		await expect(fetchHtml("https://x.test/a")).resolves.toBe("<p>ok</p>");
	});
});
