import { pickParser } from "./parsers/registry";
import type { BookPayload, ImportPipelineOptions, ProgressCallback, RawInput } from "./types";

/**
 * The one and only path from a `RawInput` to a parsed `BookPayload`.
 *
 * Every public entry point in `index.ts` is a thin wrapper: acquire a
 * `RawInput` from its source, then call this. Consumers own persistence so the
 * shared pipeline stays reusable outside Capacitor/SQLite.
 */
export async function runImportPipeline(
	input: RawInput,
	options: ImportPipelineOptions = {},
	onProgress?: ProgressCallback,
): Promise<BookPayload> {
	const parser = await pickParser(input);
	return parser.parse(input, onProgress, options);
}
