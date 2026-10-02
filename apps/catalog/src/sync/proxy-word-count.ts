import { MAX_EPUB_BYTES } from "../lib/epub-limits.js";
import { captureException } from "../lib/error-tracking.js";
import { countEpubWords } from "../lib/word-count.js";
import { storeWordCount } from "./word-count-store.js";

/**
 * Count words from the copy of an EPUB the proxy is already streaming to a
 * reader, so popular books get a count without an extra upstream download.
 * Reads its own tee branch; the reader's branch is never touched or waited on.
 * Never throws: a failure here must not reach the response.
 */
export async function countFromProxiedStream(
	id: string,
	epubUrl: string,
	stream: ReadableStream<Uint8Array>,
): Promise<void> {
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > MAX_EPUB_BYTES) {
				await reader.cancel();
				return;
			}
			chunks.push(value);
		}
		const count = await countEpubWords(Buffer.concat(chunks));
		if (count !== null) await storeWordCount(id, epubUrl, count);
	} catch (err) {
		captureException(err, { tags: { kind: "word-count-proxy" }, extra: { id } });
	}
}
