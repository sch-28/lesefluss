import { afterEach, describe, expect, it, vi } from "vitest";
import { blobToRawInput } from "../sources/blob";
import { fetchUrlToRawInput } from "../sources/url";

describe("blobToRawInput", () => {
	it("wraps a Blob as byte input", async () => {
		const input = await blobToRawInput(new Blob(["hello"], { type: "text/plain" }), "hello.txt");

		expect(input.kind).toBe("bytes");
		if (input.kind !== "bytes") throw new Error("expected bytes input");
		expect(input.fileName).toBe("hello.txt");
		expect(input.mimeType).toBe("text/plain");
		expect(new TextDecoder().decode(input.bytes)).toBe("hello");
	});
});

describe("fetchUrlToRawInput", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("fetches article HTML through the injected catalog URL", async () => {
		const fetchMock = vi.fn(
			async () =>
				new Response(
					JSON.stringify({ html: "<p>Hello</p>", finalUrl: "https://example.com/read" }),
					{
						status: 200,
						headers: { "Content-Type": "application/json" },
					},
				),
		);
		vi.stubGlobal("fetch", fetchMock);

		const result = await fetchUrlToRawInput("example.com/read", {
			catalogUrl: "https://catalog.example.test/",
		});

		expect(fetchMock).toHaveBeenCalledWith("https://catalog.example.test/proxy/article", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ url: "https://example.com/read" }),
		});
		expect(result.finalUrl).toBe("https://example.com/read");
		expect(result.input).toMatchObject({
			kind: "bytes",
			fileName: "example.com.html",
			mimeType: "text/html",
		});
		if (result.input.kind !== "bytes") throw new Error("expected bytes input");
		expect(new TextDecoder().decode(result.input.bytes)).toBe("<p>Hello</p>");
	});

	it("keeps the existing URL-source error contract", async () => {
		await expect(
			fetchUrlToRawInput("not a url", { catalogUrl: "https://catalog.test" }),
		).rejects.toThrow("INVALID_URL");

		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(null, { status: 413 })),
		);
		await expect(
			fetchUrlToRawInput("https://example.com/large", { catalogUrl: "https://catalog.test" }),
		).rejects.toThrow("TOO_LARGE");

		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(null, { status: 500 })),
		);
		await expect(
			fetchUrlToRawInput("https://example.com/fail", { catalogUrl: "https://catalog.test" }),
		).rejects.toThrow("FETCH_FAILED");
	});
});
