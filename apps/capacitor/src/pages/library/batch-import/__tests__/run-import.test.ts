import type { BookFileFormat } from "@lesefluss/book-import";
import { describe, expect, it } from "vitest";
import type { ScannedFile } from "../../../../services/book-import";
import { runBatchImport } from "../run-import";

/**
 * Sequencing, cancellation, progress and empty input belong to `runSequential`
 * and are covered by `services/batch/__tests__/run-sequential.test.ts`. What is
 * import-specific, and only tested here, is the error-code mapping and the
 * result shape this adapter promises its callers.
 */

function file(name: string, format: BookFileFormat = "epub"): ScannedFile {
	return {
		id: name,
		name,
		relativePath: name,
		size: 10,
		format,
		handle: { kind: "uri", uri: `content://${name}` },
	};
}

describe("runBatchImport", () => {
	it("maps a parser error code to the message a single import would show", async () => {
		const result = await runBatchImport({
			files: [file("good.epub"), file("bad.epub")],
			importFile: async (f) => {
				if (f.name === "bad.epub") throw new Error("EPUB_INVALID");
			},
		});

		expect(result.imported).toBe(1);
		expect(result.failures).toEqual([
			{
				file: expect.objectContaining({ name: "bad.epub" }),
				reason: "This EPUB file is corrupted or unsupported",
			},
		]);
	});

	it("describes an unrecognised failure without leaking the raw code", async () => {
		const result = await runBatchImport({
			files: [file("odd.epub")],
			importFile: async () => {
				throw new Error("SOMETHING_INTERNAL");
			},
		});
		expect(result.failures[0].reason).toBe("Couldn't import this file");
	});

	// The summary UI reads `imported` and `failures[].file`, so the adapter's
	// renaming of the generic runner's fields is part of its contract.
	it("reports the result under the names its callers read", async () => {
		const result = await runBatchImport({
			files: [file("a.epub")],
			importFile: async () => undefined,
		});
		expect(result).toEqual({ imported: 1, failures: [], cancelled: false });
	});
});
