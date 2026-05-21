import { describe, expect, it } from "vitest";
import { computeOnDeviceHash, onDevicePath } from "../hash";

describe("computeOnDeviceHash", () => {
	it("returns 8-char lowercase hex", () => {
		const result = computeOnDeviceHash("a1b2c3d4", "book");
		expect(result).toMatch(/^[0-9a-f]{8}$/);
	});

	it("routes book to /books/books and article to /books/articles", () => {
		expect(onDevicePath("abcd1234", "book")).toBe("/books/books/abcd1234.rsvp");
		expect(onDevicePath("abcd1234", "article")).toBe("/books/articles/abcd1234.rsvp");
	});

	it("produces different hashes for different categories of the same book", () => {
		const asBook = computeOnDeviceHash("a1b2c3d4", "book");
		const asArticle = computeOnDeviceHash("a1b2c3d4", "article");
		expect(asBook).not.toBe(asArticle);
	});

	it("produces a stable FNV-1a value for a known path", () => {
		// Regression check. The firmware's hashBookPath
		// (apps/rsvpnano/src/storage/RsvpDataStore.cpp) uses the same FNV-1a
		// 32-bit constants (offset 0x811c9dc5, prime 0x01000193) over identical
		// UTF-8 bytes, so this value matches the firmware by construction.
		expect(computeOnDeviceHash("abcd1234", "book")).toBe("4a935f9d");
	});

	it("is deterministic", () => {
		const id = "deadbeef";
		expect(computeOnDeviceHash(id, "book")).toBe(computeOnDeviceHash(id, "book"));
	});
});
