import type { BookPayload, Parser } from "../types";
import { assertBytes } from "../utils/raw-input";
import { canParseTxt } from "./matchers";

export const txtParser: Parser = {
	id: "txt",

	canParse: canParseTxt,

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
