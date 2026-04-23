import { commitBook } from "./commit";
import { pickParser } from "./parsers/registry";
import type { Book } from "../db/schema";
import type { ImportExtras, RawInput } from "./types";

/**
 * The one and only path from a `RawInput` to a persisted `Book`.
 *
 * Every public entry point in `index.ts` is a thin wrapper: acquire a
 * `RawInput` from its source, then call this. Keeping the `pickParser → parse
 * → commitBook` sequence in one place ensures new sources and parsers don't
 * accidentally diverge on commit semantics (e.g. skip `scheduleSyncPush`, or
 * forget an extras field).
 */
export async function runImportPipeline(
	input: RawInput,
	extras: ImportExtras = {},
	onProgress?: (pct: number) => void,
): Promise<Book> {
	const payload = await pickParser(input).parse(input, onProgress);
	return commitBook(payload, extras);
}
