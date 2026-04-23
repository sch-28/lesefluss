import type { BookPayload, Parser } from "../types";
import { assertBytes } from "../utils/raw-input";

export const txtParser: Parser = {
	id: "txt",

	canParse(input) {
		if (input.kind !== "bytes") return false;
		if (input.fileName.toLowerCase().endsWith(".txt")) return true;
		return input.mimeType?.startsWith("text/") ?? false;
	},

	async parse(input): Promise<BookPayload> {
		assertBytes(input);
		return {
			content: new TextDecoder("utf-8").decode(input.bytes),
			title: input.fileName.replace(/\.txt$/i, ""),
			author: null,
			coverImage: null,
			chapters: null,
			fileFormat: "txt",
			original: null,
		};
	},
};
