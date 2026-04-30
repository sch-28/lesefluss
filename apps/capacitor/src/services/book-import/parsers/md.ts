import type { BookPayload, Parser } from "../types";
import { assertBytes } from "../utils/raw-input";

export const mdParser: Parser = {
	id: "md",

	canParse(input) {
		if (input.kind !== "bytes") return false;
		if (input.fileName.toLowerCase().endsWith(".md")) return true;
		return input.mimeType === "text/markdown";
	},

	async parse(input): Promise<BookPayload> {
		assertBytes(input);
		const raw = new TextDecoder("utf-8").decode(input.bytes);
		const content = raw
			.split("\n")
			.map((line) => line.replace(/^#{1,6}\s+/, ""))
			.join("\n");
		return {
			content,
			title: input.fileName.replace(/\.md$/i, ""),
			author: null,
			coverImage: null,
			chapters: null,
			fileFormat: "txt",
			original: null,
		};
	},
};
