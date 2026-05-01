import { describe, expect, it } from "vitest";
import { runImportPipeline } from "../pipeline";

describe("runImportPipeline", () => {
	it("returns a BookPayload instead of committing a book", async () => {
		const payload = await runImportPipeline({ kind: "text", text: "A short title\n\nBody text." });

		expect(payload).toMatchObject({
			content: "A short title\n\nBody text.",
			title: "A short title",
			author: null,
			coverImage: null,
			chapters: null,
			fileFormat: "txt",
			original: null,
		});
		expect(payload).not.toHaveProperty("id");
	});

	it("uses the matching lightweight parser without loading heavier parsers", async () => {
		const bytes = new TextEncoder().encode("Plain file content").buffer as ArrayBuffer;
		const payload = await runImportPipeline({ kind: "bytes", bytes, fileName: "plain.txt" });

		expect(payload.content).toBe("Plain file content");
		expect(payload.title).toBe("plain");
		expect(payload.fileFormat).toBe("txt");
	});
});
