import type { BookPayload, Parser } from "../types";
import { assertText } from "../utils/raw-input";
import { deriveTitle } from "../utils/title-heuristic";

export const textParser: Parser = {
	id: "text",

	canParse(input) {
		return input.kind === "text";
	},

	async parse(input): Promise<BookPayload> {
		assertText(input);
		const title = input.hint?.title?.trim() || deriveTitle(input.text);
		return {
			content: input.text,
			title,
			author: null,
			coverImage: null,
			chapters: null,
			fileFormat: "txt",
			original: null,
		};
	},
};
