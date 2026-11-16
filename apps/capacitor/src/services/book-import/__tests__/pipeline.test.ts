import { describe, expect, it, vi } from "vitest";

vi.mock("../commit", () => ({ commitBook: vi.fn() }));
vi.mock("../image-prepare", () => ({ prepareImageOffThread: vi.fn() }));

const { assertReadable, parse } = await import("../pipeline");

const bytesOf = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;

describe("parse", () => {
	it.each([
		["empty.txt", ""],
		["blank.md", "  \n\n "],
	])("refuses %s, which has nothing to read", async (fileName, text) => {
		await expect(parse({ kind: "bytes", bytes: bytesOf(text), fileName })).rejects.toThrow(
			"FILE_EMPTY",
		);
	});

	it("stages a file with text", async () => {
		const staged = await parse({ kind: "bytes", bytes: bytesOf("Hello."), fileName: "a.txt" });
		expect(staged.payload.content).toBe("Hello.");
	});
});

describe("assertReadable", () => {
	it("lets a book of images only through", () => {
		expect(() =>
			assertReadable({
				content: "",
				images: [{ key: "i1", dataUrl: "", mediaType: "image/png" }] as never,
			}),
		).not.toThrow();
	});
});
