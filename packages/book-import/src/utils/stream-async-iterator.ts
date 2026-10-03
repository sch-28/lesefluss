/**
 * pdf.js reads page text with `for await` over a ReadableStream, which Chromium
 * supports only from 124; its legacy build polyfills much else but not this.
 * Without it, PDF import fails on Android WebViews 111-123, which the app
 * otherwise supports.
 */
export function ensureReadableStreamAsyncIterator(): void {
	if (typeof ReadableStream === "undefined") return;
	const proto = ReadableStream.prototype as unknown as { [Symbol.asyncIterator]?: unknown };
	if (proto[Symbol.asyncIterator]) return;
	proto[Symbol.asyncIterator] = async function* (this: ReadableStream<unknown>) {
		const reader = this.getReader();
		try {
			for (;;) {
				const { done, value } = await reader.read();
				if (done) return;
				yield value;
			}
		} finally {
			reader.releaseLock();
		}
	};
}
