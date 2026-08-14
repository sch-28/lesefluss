import type { BookFileFormat } from "@lesefluss/book-import";
import { describe, expect, it, vi } from "vitest";
import type { ScannedFile } from "../../../../services/book-import";
import { type BatchProgress, runBatchImport } from "../run-import";

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
	it("imports every file in order", async () => {
		const seen: string[] = [];
		const result = await runBatchImport({
			files: [file("a.epub"), file("b.epub"), file("c.epub")],
			importFile: async (f) => {
				seen.push(f.name);
			},
		});

		expect(seen).toEqual(["a.epub", "b.epub", "c.epub"]);
		expect(result).toEqual({ imported: 3, failures: [], cancelled: false });
	});

	// One unreadable file in a folder of hundreds must not end the run.
	it("records a failure and keeps going", async () => {
		const result = await runBatchImport({
			files: [file("good.epub"), file("bad.epub"), file("also-good.epub")],
			importFile: async (f) => {
				if (f.name === "bad.epub") throw new Error("EPUB_INVALID");
			},
		});

		expect(result.imported).toBe(2);
		expect(result.failures).toHaveLength(1);
		expect(result.failures[0].file.name).toBe("bad.epub");
		// The same wording a single import of that file would show.
		expect(result.failures[0].reason).toBe("This EPUB file is corrupted or unsupported");
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

	it("stops after the in-flight book when cancelled, keeping what was written", async () => {
		let cancelled = false;
		const seen: string[] = [];
		const result = await runBatchImport({
			files: [file("a.epub"), file("b.epub"), file("c.epub")],
			importFile: async (f) => {
				seen.push(f.name);
				if (f.name === "b.epub") cancelled = true;
			},
			isCancelled: () => cancelled,
		});

		expect(seen).toEqual(["a.epub", "b.epub"]);
		expect(result).toEqual({ imported: 2, failures: [], cancelled: true });
	});

	it("reports progress per book and finishes at the total", async () => {
		const progress: BatchProgress[] = [];
		await runBatchImport({
			files: [file("a.epub"), file("b.epub")],
			importFile: async () => undefined,
			onProgress: (p) => progress.push({ ...p }),
		});

		expect(progress).toEqual([
			{ done: 0, total: 2, current: "a.epub" },
			{ done: 1, total: 2, current: "b.epub" },
			{ done: 2, total: 2, current: "" },
		]);
	});

	it("never runs two imports concurrently", async () => {
		let inFlight = 0;
		let maxInFlight = 0;
		await runBatchImport({
			files: [file("a.epub"), file("b.epub"), file("c.epub")],
			importFile: async () => {
				inFlight += 1;
				maxInFlight = Math.max(maxInFlight, inFlight);
				await new Promise((resolve) => setTimeout(resolve, 1));
				inFlight -= 1;
			},
		});
		expect(maxInFlight).toBe(1);
	});

	it("does nothing when the selection is empty", async () => {
		const importFile = vi.fn();
		const result = await runBatchImport({ files: [], importFile });
		expect(importFile).not.toHaveBeenCalled();
		expect(result).toEqual({ imported: 0, failures: [], cancelled: false });
	});
});
