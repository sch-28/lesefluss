import type { BookPayload, Parser } from "../types";
import { assertBytes } from "../utils/raw-input";
import { canParseMarkdown } from "./matchers";

export const mdParser: Parser = {
	id: "md",

	canParse: canParseMarkdown,

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
